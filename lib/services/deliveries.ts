// Deliveries: creating them, handing them to riders, and moving them through
// their statuses. Every change is ONE guarded UPDATE whose WHERE clause names
// both the owner and the status it expects, e.g.
//
//   UPDATE deliveries SET status = 'picked_up' ... WHERE id = $1 AND rider_id = $me AND status = 'assigned'
//
// If someone else got there first (another rider took the job, the business
// cancelled it), the UPDATE simply matches no row, so two people racing can
// never both win. We then look at why it matched nothing to give a clear message.
import { pgCode, q, q1, tx, type Queryable } from "../db";
import { businessChannel, fleetChannel, trackChannel } from "../channels";
import { newOtp, newTrackingCode } from "../codes";
import { type DeliveryStatus, MAX_OTP_ATTEMPTS, STATUS_LABEL } from "../constants";
import { link, sendEmail } from "../email";
import { formatTime } from "../format";
import { publish } from "../realtime";
import { displayCode } from "../tracking-code";
import type { DeliveryInput, DeliveryList } from "../validation";
import { type Actor, mustBe } from "./actor";
import { ConflictError, NotFoundError, RuleError } from "./errors";
import { recordEvent } from "./events";

export type Delivery = {
  id: string;
  business_id: string;
  tracking_code: string;
  status: DeliveryStatus;
  customer_name: string;
  customer_phone: string;
  package: string;
  notes: string;
  fee_kobo: number | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  otp: string;
  otp_attempts: number;
  proof_photo_url: string | null;
  reason: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_heading: number | null;
  last_speed_mps: number | null;
  last_accuracy_m: number | null;
  last_point_at: Date | null;
  simulated: boolean;
  created_at: Date;
  assigned_at: Date | null;
  picked_up_at: Date | null;
  arrived_at: Date | null;
  finished_at: Date | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_vehicle: string | null;
  rider_phone: string | null;
  rider_plate: string | null;
};

export type DeliveryEvent = { id: number; status: string; note: string; created_at: Date; actor_name: string | null };

const SELECT = `
  SELECT d.id, d.business_id, d.tracking_code, d.status, d.customer_name, d.customer_phone, d.package,
         d.notes, d.fee_kobo, d.pickup_address, d.pickup_lat, d.pickup_lng, d.dropoff_address,
         d.dropoff_lat, d.dropoff_lng, d.otp, d.otp_attempts, d.proof_photo_url, d.reason,
         d.last_lat, d.last_lng, d.last_heading, d.last_speed_mps, d.last_accuracy_m, d.last_point_at,
         d.simulated, d.created_at, d.assigned_at, d.picked_up_at, d.arrived_at, d.finished_at,
         d.rider_id, ru.name AS rider_name, r.vehicle AS rider_vehicle, r.phone AS rider_phone, r.plate AS rider_plate
    FROM deliveries d
    LEFT JOIN users ru ON ru.id = d.rider_id
    LEFT JOIN riders r ON r.user_id = d.rider_id`;

/** Tell every open screen that a delivery changed. Runs after the transaction commits. */
async function announce(d: { id: string; tracking_code: string; business_id: string; status: string }, jobsChanged = false) {
  await publish(trackChannel(d.tracking_code), "status", { status: d.status });
  await publish(businessChannel(d.business_id), "status", { deliveryId: d.id, status: d.status });
  if (jobsChanged) await publish(fleetChannel(d.business_id), "jobs", { deliveryId: d.id });
}

/** Is this rider in this business's fleet, and not paused? */
async function riderInFleet(db: Queryable, riderId: string, businessId: string) {
  const { rows } = await db.query<{ name: string }>(
    `SELECT u.name FROM riders r JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1 AND r.business_id = $2 AND u.suspended_at IS NULL`,
    [riderId, businessId],
  );
  return rows[0] ?? null;
}

// ── Business: create and manage ──────────────────────────────────────────────

export async function createDelivery(actor: Actor | null, input: DeliveryInput): Promise<{ id: string; tracking_code: string }> {
  const me = mustBe(actor, "business");
  const created = await tx(async (db) => {
    let riderName: string | null = null;
    if (input.riderId) {
      const r = await riderInFleet(db, input.riderId, me.id);
      if (!r) throw new RuleError("Choose one of your own riders.", "riderId");
      riderName = r.name;
    }
    // A fresh tracking code; in the very rare case it already exists, the
    // UNIQUE constraint rejects it and we try another (a savepoint lets the
    // transaction carry on after that one failed insert).
    for (let attempt = 0; attempt < 5; attempt++) {
      await db.query("SAVEPOINT code");
      try {
        const { rows } = await db.query<{ id: string; tracking_code: string; status: string; business_id: string }>(
          `INSERT INTO deliveries (business_id, rider_id, tracking_code, status, customer_name, customer_phone,
                                   package, notes, fee_kobo, pickup_address, pickup_lat, pickup_lng,
                                   dropoff_address, dropoff_lat, dropoff_lng, otp, assigned_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                   CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END)
           RETURNING id, tracking_code, status, business_id`,
          [
            me.id, input.riderId, newTrackingCode(), input.riderId ? "assigned" : "pending",
            input.customerName, input.customerPhone, input.package, input.notes, input.fee,
            input.pickupAddress, input.pickupLat, input.pickupLng,
            input.dropoffAddress, input.dropoffLat, input.dropoffLng, newOtp(),
          ],
        );
        await db.query("RELEASE SAVEPOINT code");
        const d = rows[0]!;
        await recordEvent(db, d.id, "pending", "Delivery created", me.id);
        if (riderName) await recordEvent(db, d.id, "assigned", `Assigned to ${riderName}`, me.id);
        return d;
      } catch (e) {
        await db.query("ROLLBACK TO SAVEPOINT code");
        if (pgCode(e) !== "23505") throw e;
      }
    }
    throw new Error("Could not generate a unique tracking code.");
  });
  await announce(created, true);
  return created;
}

export async function listBusinessDeliveries(actor: Actor | null, list: DeliveryList): Promise<Delivery[]> {
  const me = mustBe(actor, "business");
  const statuses: Record<DeliveryList["view"], string[] | null> = {
    active: ["assigned", "picked_up", "arrived", "pending"],
    pending: ["pending"],
    done: ["delivered", "failed", "cancelled"],
    all: null,
  };
  const params: unknown[] = [me.id, statuses[list.view]];
  let search = "";
  if (list.q) {
    // Search by customer name, tracking code or package. ILIKE with the
    // wildcards escaped, so a "%" typed by the person is just a character.
    params.push(`%${list.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    search = `AND (d.customer_name ILIKE $3 OR d.tracking_code ILIKE replace($3, '-', '') OR d.package ILIKE $3)`;
  }
  return q<Delivery>(
    `${SELECT}
      WHERE d.business_id = $1 AND ($2::text[] IS NULL OR d.status = ANY($2)) ${search}
      ORDER BY CASE d.status WHEN 'arrived' THEN 0 WHEN 'picked_up' THEN 1 WHEN 'assigned' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
               d.created_at DESC
      LIMIT 100`,
    params,
  );
}

export async function businessCounts(actor: Actor | null) {
  const me = mustBe(actor, "business");
  const row = await q1<{ pending: number; assigned: number; live: number; delivered_today: number; failed_today: number }>(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'assigned')::int AS assigned,
            count(*) FILTER (WHERE status IN ('picked_up', 'arrived'))::int AS live,
            count(*) FILTER (WHERE status = 'delivered' AND finished_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::int AS delivered_today,
            count(*) FILTER (WHERE status = 'failed' AND finished_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::int AS failed_today
       FROM deliveries WHERE business_id = $1`,
    [me.id],
  );
  return row!;
}

/** One delivery, but only if it belongs to this business. Otherwise: not found. */
export async function getBusinessDelivery(actor: Actor | null, id: string): Promise<{ delivery: Delivery; events: DeliveryEvent[] }> {
  const me = mustBe(actor, "business");
  const delivery = await q1<Delivery>(`${SELECT} WHERE d.id = $1 AND d.business_id = $2`, [id, me.id]);
  if (!delivery) throw new NotFoundError("That delivery");
  return { delivery, events: await eventsFor(id) };
}

export async function eventsFor(deliveryId: string): Promise<DeliveryEvent[]> {
  return q<DeliveryEvent>(
    `SELECT e.id, e.status, e.note, e.created_at, u.name AS actor_name
       FROM delivery_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.delivery_id = $1 ORDER BY e.id`,
    [deliveryId],
  );
}

/** Lock this business's delivery row for the rest of the transaction, or 404. */
async function lockForBusiness(db: Queryable, id: string, businessId: string) {
  const { rows } = await db.query<{ id: string; status: DeliveryStatus; rider_id: string | null; tracking_code: string; business_id: string }>(
    "SELECT id, status, rider_id, tracking_code, business_id FROM deliveries WHERE id = $1 AND business_id = $2 FOR UPDATE",
    [id, businessId],
  );
  if (!rows[0]) throw new NotFoundError("That delivery");
  return rows[0];
}

/** Hand a delivery to a rider, or move it to a different rider before pickup. */
export async function assignDelivery(actor: Actor | null, id: string, riderId: string): Promise<void> {
  const me = mustBe(actor, "business");
  const d = await tx(async (db) => {
    const d = await lockForBusiness(db, id, me.id);
    if (d.status !== "pending" && d.status !== "assigned")
      throw new ConflictError("This delivery has already been collected, so its rider can't change.");
    if (d.rider_id === riderId) return null;
    const r = await riderInFleet(db, riderId, me.id);
    if (!r) throw new RuleError("Choose one of your own riders.", "riderId");
    await db.query(
      "UPDATE deliveries SET rider_id = $2, status = 'assigned', assigned_at = now() WHERE id = $1",
      [id, riderId],
    );
    await recordEvent(db, id, "assigned", `${d.rider_id ? "Moved" : "Assigned"} to ${r.name}`, me.id);
    return { ...d, status: "assigned" };
  });
  if (d) await announce(d, true);
}

/** Take a delivery back from a rider (before pickup), returning it to the job board. */
export async function unassignDelivery(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "business");
  const d = await tx(async (db) => {
    const d = await lockForBusiness(db, id, me.id);
    if (d.status !== "assigned") throw new ConflictError("Only a delivery that hasn't been collected yet can be taken back.");
    await db.query("UPDATE deliveries SET rider_id = NULL, status = 'pending', assigned_at = NULL WHERE id = $1", [id]);
    await recordEvent(db, id, "pending", "Taken back by the business; waiting for a rider", me.id);
    return { ...d, status: "pending" };
  });
  await announce(d, true);
}

export async function cancelDelivery(actor: Actor | null, id: string, reason: string): Promise<void> {
  const me = mustBe(actor, "business");
  const d = await tx(async (db) => {
    const d = await lockForBusiness(db, id, me.id);
    if (d.status !== "pending" && d.status !== "assigned")
      throw new ConflictError(
        d.status === "picked_up" || d.status === "arrived"
          ? "The rider already has this parcel. Mark it as failed instead, so it's clear it needs returning."
          : "This delivery is already finished.",
      );
    await db.query("UPDATE deliveries SET status = 'cancelled', reason = $2, finished_at = now() WHERE id = $1", [id, reason]);
    await recordEvent(db, id, "cancelled", reason, me.id);
    return { ...d, status: "cancelled" };
  });
  await announce(d, true);
}

/** Issue a new delivery code (after too many wrong tries, or if the old one leaked). */
export async function resetOtp(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "business");
  const d = await q1<{ id: string; tracking_code: string; business_id: string; status: string }>(
    `UPDATE deliveries SET otp = $3, otp_attempts = 0
      WHERE id = $1 AND business_id = $2 AND finished_at IS NULL
      RETURNING id, tracking_code, business_id, status`,
    [id, me.id, newOtp()],
  );
  if (!d) {
    await getBusinessDelivery(me, id); // throws NotFound if it isn't theirs
    throw new ConflictError("This delivery is already finished.");
  }
  await announce(d);
}

// ── Both: a parcel that can't be delivered ───────────────────────────────────

/**
 * The customer can't be reached, the address is wrong... Only while the parcel
 * is out (picked up or arrived). The assigned rider or their business may do it.
 */
export async function failDelivery(actor: Actor | null, id: string, reason: string): Promise<void> {
  const me = mustBe(actor, "business", "rider");
  const owner = me.role === "business" ? "business_id" : "rider_id";
  const d = await tx(async (db) => {
    const { rows } = await db.query<{ id: string; tracking_code: string; business_id: string; status: string }>(
      `UPDATE deliveries SET status = 'failed', reason = $3, finished_at = now()
        WHERE id = $1 AND ${owner} = $2 AND status IN ('picked_up', 'arrived')
        RETURNING id, tracking_code, business_id, status`,
      [id, me.id, reason],
    );
    if (!rows[0]) {
      const exists = await db.query(`SELECT 1 FROM deliveries WHERE id = $1 AND ${owner} = $2`, [id, me.id]);
      if (!exists.rows[0]) throw new NotFoundError("That delivery");
      throw new ConflictError("Only a parcel that's out for delivery can be marked as failed.");
    }
    await recordEvent(db, id, "failed", reason, me.id);
    return rows[0];
  });
  await announce(d);
  await emailBusiness(d.id, "failed");
}

// ── Rider: the job board and the trip ────────────────────────────────────────

export type RiderJob = Pick<
  Delivery,
  | "id" | "tracking_code" | "status" | "customer_name" | "package" | "notes" | "fee_kobo"
  | "pickup_address" | "pickup_lat" | "pickup_lng" | "dropoff_address" | "dropoff_lat" | "dropoff_lng"
  | "created_at" | "assigned_at" | "finished_at"
>;

const RIDER_COLS = `d.id, d.tracking_code, d.status, d.customer_name, d.package, d.notes, d.fee_kobo,
  d.pickup_address, d.pickup_lat, d.pickup_lng, d.dropoff_address, d.dropoff_lat, d.dropoff_lng,
  d.created_at, d.assigned_at, d.finished_at`;

/** Everything on the rider's home screen. */
export async function riderBoard(actor: Actor | null) {
  const me = mustBe(actor, "rider");
  const [mine, open, done] = await Promise.all([
    q<RiderJob>(
      `SELECT ${RIDER_COLS} FROM deliveries d
        WHERE d.rider_id = $1 AND d.status IN ('assigned', 'picked_up', 'arrived')
        ORDER BY d.status = 'assigned', d.assigned_at`,
      [me.id],
    ),
    // Open jobs: pending deliveries of MY fleet only.
    q<RiderJob>(
      `SELECT ${RIDER_COLS} FROM deliveries d
        WHERE d.status = 'pending' AND d.business_id = (SELECT business_id FROM riders WHERE user_id = $1)
        ORDER BY d.created_at LIMIT 30`,
      [me.id],
    ),
    q<RiderJob>(
      `SELECT ${RIDER_COLS} FROM deliveries d
        WHERE d.rider_id = $1 AND d.status IN ('delivered', 'failed')
          AND d.finished_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
        ORDER BY d.finished_at DESC`,
      [me.id],
    ),
  ]);
  return {
    live: mine.find((d) => d.status === "picked_up" || d.status === "arrived") ?? null,
    queued: mine.filter((d) => d.status === "assigned"),
    open,
    doneToday: done,
  };
}

/** Take a job from the board. If ten riders tap at once, exactly one gets it. */
export async function acceptJob(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "rider");
  const d = await tx(async (db) => {
    const r = await db.query<{ on_duty: boolean }>("SELECT on_duty FROM riders WHERE user_id = $1", [me.id]);
    if (!r.rows[0]?.on_duty) throw new RuleError("Go on duty first, then take jobs.");
    const { rows } = await db.query<{ id: string; tracking_code: string; business_id: string; status: string }>(
      `UPDATE deliveries SET rider_id = $2, status = 'assigned', assigned_at = now()
        WHERE id = $1 AND status = 'pending'
          AND business_id = (SELECT business_id FROM riders WHERE user_id = $2)
        RETURNING id, tracking_code, business_id, status`,
      [id, me.id],
    );
    if (!rows[0]) {
      const exists = await db.query(
        "SELECT 1 FROM deliveries WHERE id = $1 AND business_id = (SELECT business_id FROM riders WHERE user_id = $2)",
        [id, me.id],
      );
      if (!exists.rows[0]) throw new NotFoundError("That job");
      throw new ConflictError("Another rider has just taken this job.");
    }
    await recordEvent(db, id, "assigned", `${me.name} took the job`, me.id);
    return rows[0];
  });
  await announce(d, true);
}

/** Give a job back to the board (before pickup). */
export async function releaseJob(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "rider");
  const d = await riderStep(me, id, "assigned", "pending",
    "rider_id = NULL, assigned_at = NULL", `${me.name} gave the job back`,
    "Only a job you haven't collected yet can be given back.");
  await announce(d, true);
}

/** Parcel collected: the trip starts and live tracking switches on. */
export async function startTrip(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "rider");
  try {
    const d = await riderStep(me, id, "assigned", "picked_up", "picked_up_at = now()",
      "Parcel collected; on the way", "This delivery isn't waiting to be collected.");
    await announce(d);
  } catch (e) {
    // The partial unique index allows only one live trip per rider. Two taps on
    // two different jobs at the same moment can't both start.
    if (pgCode(e) === "23505") throw new ConflictError("You're already on a trip. Finish it before starting another.");
    throw e;
  }
}

export async function markArrived(actor: Actor | null, id: string): Promise<void> {
  const me = mustBe(actor, "rider");
  const d = await riderStep(me, id, "picked_up", "arrived", "arrived_at = now()",
    "Rider is at the drop-off", "You can only arrive on a trip that's under way.");
  await announce(d);
}

/** One guarded status change by the assigned rider, with its history line. */
async function riderStep(me: Actor, id: string, from: DeliveryStatus, to: DeliveryStatus, set: string, note: string, conflict: string) {
  return tx(async (db) => {
    const { rows } = await db.query<{ id: string; tracking_code: string; business_id: string; status: string }>(
      `UPDATE deliveries SET status = '${to}', ${set}
        WHERE id = $1 AND rider_id = $2 AND status = '${from}'
        RETURNING id, tracking_code, business_id, status`,
      [id, me.id],
    );
    if (!rows[0]) {
      const exists = await db.query("SELECT 1 FROM deliveries WHERE id = $1 AND rider_id = $2", [id, me.id]);
      if (!exists.rows[0]) throw new NotFoundError("That delivery");
      throw new ConflictError(conflict);
    }
    await recordEvent(db, id, to, note, me.id);
    return rows[0];
  });
}

/** Photo-proof URLs must point at our own Vercel Blob store, in this delivery's folder. */
export function isOurProofUrl(url: string, deliveryId: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname.startsWith(`/proofs/${deliveryId}/`);
  } catch {
    return false;
  }
}

export const photoProofEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * The handover. The customer reads their 4-digit code to the rider; it must
 * match. Wrong guesses are counted and, after 5, the code locks until the
 * business issues a new one, so a rider can't just try all 10,000 codes.
 */
export async function confirmDelivery(actor: Actor | null, id: string, otp: string, photoUrl: string | null): Promise<void> {
  const me = mustBe(actor, "rider");
  if (photoProofEnabled() && !photoUrl) throw new RuleError("Take a photo of the parcel at the door first.", "photo");
  if (photoUrl && !isOurProofUrl(photoUrl, id)) throw new RuleError("That photo didn't upload properly. Take it again.", "photo");

  const result = await tx(async (db) => {
    const { rows } = await db.query<{ status: DeliveryStatus; otp: string; otp_attempts: number; tracking_code: string; business_id: string }>(
      "SELECT status, otp, otp_attempts, tracking_code, business_id FROM deliveries WHERE id = $1 AND rider_id = $2 FOR UPDATE",
      [id, me.id],
    );
    const d = rows[0];
    if (!d) throw new NotFoundError("That delivery");
    if (d.status !== "picked_up" && d.status !== "arrived") throw new ConflictError("This delivery isn't out for delivery.");
    if (d.otp_attempts >= MAX_OTP_ATTEMPTS) throw new ConflictError("Too many wrong codes. Ask the business to send the customer a new code.");
    if (d.otp !== otp) {
      // Commit the count (we RETURN rather than throw, so this isn't rolled back).
      await db.query("UPDATE deliveries SET otp_attempts = otp_attempts + 1 WHERE id = $1", [id]);
      return { ok: false as const, left: MAX_OTP_ATTEMPTS - d.otp_attempts - 1 };
    }
    await db.query(
      `UPDATE deliveries SET status = 'delivered', finished_at = now(), proof_photo_url = $2,
              arrived_at = coalesce(arrived_at, now())
        WHERE id = $1`,
      [id, photoUrl],
    );
    await recordEvent(db, id, "delivered", "Handed over; customer confirmed with their code", me.id);
    return { ok: true as const, d: { id, tracking_code: d.tracking_code, business_id: d.business_id, status: "delivered" } };
  });
  if (!result.ok) {
    throw new RuleError(
      result.left > 0
        ? `That code isn't right. ${result.left} ${result.left === 1 ? "try" : "tries"} left.`
        : "That code isn't right, and the code is now locked. Ask the business to send a new one.",
      "otp",
    );
  }
  await announce(result.d);
  await emailBusiness(id, "delivered");
}

export type RiderTrip = RiderJob & {
  customer_phone: string | null;
  business_name: string;
  business_phone: string;
  last_lat: number | null;
  last_lng: number | null;
  simulated: boolean;
  otp_attempts: number;
  vehicle: string;
};

/** The trip screen. Only the assigned rider can open it; the code itself is never included. */
export async function getRiderTrip(actor: Actor | null, id: string): Promise<RiderTrip> {
  const me = mustBe(actor, "rider");
  const t = await q1<RiderTrip>(
    `SELECT ${RIDER_COLS},
            -- The customer's number only while the rider actually needs it.
            CASE WHEN d.status IN ('assigned', 'picked_up', 'arrived') THEN d.customer_phone END AS customer_phone,
            b.name AS business_name, b.phone AS business_phone, d.last_lat, d.last_lng, d.simulated,
            d.otp_attempts, r.vehicle
       FROM deliveries d
       JOIN businesses b ON b.user_id = d.business_id
       JOIN riders r ON r.user_id = d.rider_id
      WHERE d.id = $1 AND d.rider_id = $2`,
    [id, me.id],
  );
  if (!t) throw new NotFoundError("That trip");
  return t;
}

// ── Email the business when a delivery finishes ──────────────────────────────
async function emailBusiness(id: string, outcome: "delivered" | "failed") {
  const d = await q1<{ email: string; customer_name: string; tracking_code: string; rider_name: string | null; reason: string | null; finished_at: Date }>(
    `SELECT u.email, d.customer_name, d.tracking_code, ru.name AS rider_name, d.reason, d.finished_at
       FROM deliveries d JOIN users u ON u.id = d.business_id LEFT JOIN users ru ON ru.id = d.rider_id
      WHERE d.id = $1`,
    [id],
  );
  if (!d) return;
  const code = displayCode(d.tracking_code);
  await sendEmail({
    to: d.email,
    subject: outcome === "delivered" ? `Delivered: ${code} to ${d.customer_name}` : `Couldn't deliver ${code}`,
    text:
      outcome === "delivered"
        ? `${d.rider_name ?? "Your rider"} delivered ${code} to ${d.customer_name} at ${formatTime(d.finished_at)}. The customer confirmed with their code.\n\nDetails: ${link(`/business/deliveries/${id}`)}`
        : `${d.rider_name ?? "Your rider"} couldn't deliver ${code} to ${d.customer_name}.\nReason: ${d.reason ?? "not given"}\n\nThe parcel needs to come back to you. Details: ${link(`/business/deliveries/${id}`)}`,
  });
}

export const statusLabel = (s: string) => STATUS_LABEL[s as DeliveryStatus] ?? s;
