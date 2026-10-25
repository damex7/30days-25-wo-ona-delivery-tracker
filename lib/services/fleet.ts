// Businesses and their riders (the "fleet").
import { pgCode, q, q1, tx } from "../db";
import { newFleetCode } from "../codes";
import type { BusinessSettingsInput } from "../validation";
import { type Actor, mustBe } from "./actor";
import { ConflictError, NotFoundError } from "./errors";
import { recordEvent } from "./events";

export type Business = {
  user_id: string;
  name: string;
  phone: string;
  state: string;
  city: string;
  fleet_code: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
};

export async function getMyBusiness(actor: Actor | null): Promise<Business> {
  const me = mustBe(actor, "business");
  const b = await q1<Business>(
    `SELECT user_id, name, phone, state, city, fleet_code, pickup_address, pickup_lat, pickup_lng
       FROM businesses WHERE user_id = $1`,
    [me.id],
  );
  if (!b) throw new NotFoundError("Your business");
  return b;
}

export async function updateBusiness(actor: Actor | null, input: BusinessSettingsInput): Promise<void> {
  const me = mustBe(actor, "business");
  await q(
    `UPDATE businesses SET name = $2, phone = $3, state = $4, city = $5,
            pickup_address = $6, pickup_lat = $7, pickup_lng = $8
      WHERE user_id = $1`,
    [me.id, input.name, input.phone, input.state, input.city, input.pickupAddress, input.pickupLat, input.pickupLng],
  );
}

/** A new fleet code. The old one stops working, so a leaked code can be "changed like a lock". */
export async function regenerateFleetCode(actor: Actor | null): Promise<string> {
  const me = mustBe(actor, "business");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = newFleetCode();
      await q("UPDATE businesses SET fleet_code = $2 WHERE user_id = $1", [me.id, code]);
      return code;
    } catch (e) {
      if (pgCode(e) !== "23505") throw e;
    }
  }
  throw new Error("Could not generate a unique fleet code.");
}

export type RiderRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  plate: string | null;
  on_duty: boolean;
  suspended: boolean;
  live_delivery_id: string | null;
  live_code: string | null;
  queued: number;
  delivered_today: number;
};

/** This business's riders, with what each is doing right now. */
export async function listMyRiders(actor: Actor | null): Promise<RiderRow[]> {
  const me = mustBe(actor, "business");
  return q<RiderRow>(
    `SELECT u.id, u.name, u.email, r.phone, r.vehicle, r.plate, r.on_duty,
            u.suspended_at IS NOT NULL AS suspended,
            live.id AS live_delivery_id, live.tracking_code AS live_code,
            (SELECT count(*) FROM deliveries d WHERE d.rider_id = u.id AND d.status = 'assigned')::int AS queued,
            (SELECT count(*) FROM deliveries d WHERE d.rider_id = u.id AND d.status = 'delivered'
                AND d.finished_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::int AS delivered_today
       FROM riders r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN deliveries live ON live.rider_id = u.id AND live.status IN ('picked_up', 'arrived')
      WHERE r.business_id = $1
      ORDER BY u.suspended_at IS NOT NULL, live.id IS NULL, u.name`,
    [me.id],
  );
}

/** Riders the business can hand a delivery to right now (not paused). */
export async function listAssignableRiders(actor: Actor | null) {
  const me = mustBe(actor, "business");
  return q<{ id: string; name: string; vehicle: string; on_duty: boolean; busy: boolean }>(
    `SELECT u.id, u.name, r.vehicle, r.on_duty,
            EXISTS (SELECT 1 FROM deliveries d WHERE d.rider_id = u.id AND d.status IN ('picked_up', 'arrived')) AS busy
       FROM riders r JOIN users u ON u.id = r.user_id
      WHERE r.business_id = $1 AND u.suspended_at IS NULL
      ORDER BY r.on_duty DESC, u.name`,
    [me.id],
  );
}

/**
 * Pause a rider (they can't log in or act). Only the rider's own business can,
 * and not mid-trip: a parcel in someone's hands must be finished or marked
 * failed first. Their not-yet-collected jobs go back to the job board.
 */
export async function pauseRider(actor: Actor | null, riderId: string): Promise<void> {
  const me = mustBe(actor, "business");
  await tx(async (db) => {
    const { rows } = await db.query<{ live: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM deliveries d WHERE d.rider_id = r.user_id AND d.status IN ('picked_up', 'arrived')) AS live
         FROM riders r WHERE r.user_id = $1 AND r.business_id = $2 FOR UPDATE`,
      [riderId, me.id],
    );
    if (!rows[0]) throw new NotFoundError("That rider");
    if (rows[0].live) throw new ConflictError("This rider is on a trip. Wait until it's finished, or mark it as failed first.");
    await db.query("UPDATE users SET suspended_at = now() WHERE id = $1", [riderId]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [riderId]); // logged out everywhere
    const released = await db.query<{ id: string }>(
      `UPDATE deliveries SET rider_id = NULL, status = 'pending', assigned_at = NULL
        WHERE rider_id = $1 AND status = 'assigned' RETURNING id`,
      [riderId],
    );
    for (const d of released.rows) await recordEvent(db, d.id, "pending", "Rider was paused; back on the job board", me.id);
  });
}

export async function unpauseRider(actor: Actor | null, riderId: string): Promise<void> {
  const me = mustBe(actor, "business");
  const row = await q1(
    `UPDATE users SET suspended_at = NULL
      WHERE id = $1 AND id IN (SELECT user_id FROM riders WHERE business_id = $2) RETURNING id`,
    [riderId, me.id],
  );
  if (!row) throw new NotFoundError("That rider");
}

// ── The rider's own profile ─────────────────────────────────────────────────
export type MyRider = {
  user_id: string;
  business_id: string;
  business_name: string;
  business_phone: string;
  phone: string;
  vehicle: string;
  plate: string | null;
  on_duty: boolean;
};

export async function getMyRider(actor: Actor | null): Promise<MyRider> {
  const me = mustBe(actor, "rider");
  const r = await q1<MyRider>(
    `SELECT r.user_id, r.business_id, b.name AS business_name, b.phone AS business_phone,
            r.phone, r.vehicle, r.plate, r.on_duty
       FROM riders r JOIN businesses b ON b.user_id = r.business_id
      WHERE r.user_id = $1`,
    [me.id],
  );
  if (!r) throw new NotFoundError("Your rider profile");
  return r;
}

export async function setOnDuty(actor: Actor | null, onDuty: boolean): Promise<void> {
  const me = mustBe(actor, "rider");
  await q("UPDATE riders SET on_duty = $2 WHERE user_id = $1", [me.id, onDuty]);
}
