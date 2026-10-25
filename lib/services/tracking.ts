// Live location: receiving GPS points from the rider's phone, and showing them
// to the customer and the business.
import { q, q1, tx } from "../db";
import { businessChannel, type PointMessage, trackChannel } from "../channels";
import { type DeliveryStatus, LIVE_STATUSES, STATUS_LABEL, TIMELINE } from "../constants";
import { curvedPath, etaMinutes, type LatLng } from "../geo";
import { publish } from "../realtime";
import type { LocationBatch } from "../validation";
import { type Actor, mustBe } from "./actor";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";

/** Points worse than this (a phone guessing from cell towers) would make the rider jump around. */
export const MAX_ACCURACY_M = 250;

/**
 * Simulated GPS is a demo feature. On a real fleet a rider could use it to
 * fake being on the road, so it's only allowed for demo accounts, or when the
 * owner deliberately switches it on with ALLOW_SIMULATED_TRIPS=true.
 */
export function canSimulate(actor: Actor): boolean {
  return actor.isDemo || process.env.ALLOW_SIMULATED_TRIPS === "true";
}

/**
 * Save a batch of GPS points from the assigned rider's phone. Batches (not one
 * point per request) let a phone that lost signal for a minute send everything
 * it collected once it's back online.
 */
export async function recordPoints(actor: Actor | null, batch: LocationBatch, now = Date.now()) {
  const me = mustBe(actor, "rider");
  if (batch.simulated && !canSimulate(me)) throw new ForbiddenError("Simulated trips are turned off for this account.");

  // Keep only believable points: not from the future (allowing 2 minutes of
  // phone-clock drift), not stale, and accurate enough to be useful. Oldest first.
  const points = batch.points
    .filter((p) => p.at <= now + 120_000 && p.at >= now - 15 * 60_000 && p.accuracy <= MAX_ACCURACY_M)
    .sort((a, b) => a.at - b.at);

  const saved = await tx(async (db) => {
    const { rows } = await db.query<{ status: DeliveryStatus; tracking_code: string; business_id: string; last_point_at: Date | null }>(
      "SELECT status, tracking_code, business_id, last_point_at FROM deliveries WHERE id = $1 AND rider_id = $2 FOR UPDATE",
      [batch.deliveryId, me.id],
    );
    const d = rows[0];
    if (!d) throw new NotFoundError("That trip");
    // Location is only shared while the parcel is out. Before pickup and after
    // the handover, the rider's position is nobody's business.
    if (!LIVE_STATUSES.includes(d.status)) throw new ConflictError("Location sharing is off: this trip isn't under way.");
    if (points.length === 0) return null;

    // One INSERT for the whole batch: unnest() turns parallel arrays into rows.
    await db.query(
      `INSERT INTO delivery_points (delivery_id, lat, lng, accuracy_m, heading, speed_mps, recorded_at)
       SELECT $1, * FROM unnest($2::float8[], $3::float8[], $4::real[], $5::real[], $6::real[], $7::timestamptz[])`,
      [
        batch.deliveryId,
        points.map((p) => p.lat),
        points.map((p) => p.lng),
        points.map((p) => p.accuracy),
        points.map((p) => p.heading),
        points.map((p) => p.speed),
        points.map((p) => new Date(p.at).toISOString()),
      ],
    );
    const newest = points[points.length - 1]!;
    // Only move the "current position" forward in time. Batches can arrive out
    // of order on a patchy network; an old point must never pull the rider back.
    const moved = await db.query(
      `UPDATE deliveries SET last_lat = $2, last_lng = $3, last_accuracy_m = $4, last_heading = $5,
              last_speed_mps = $6, last_point_at = $7, simulated = simulated OR $8
        WHERE id = $1 AND (last_point_at IS NULL OR last_point_at < $7)`,
      [batch.deliveryId, newest.lat, newest.lng, newest.accuracy, newest.heading, newest.speed, new Date(newest.at), batch.simulated],
    );
    return { d, newest, moved: (moved.rowCount ?? 0) > 0 };
  });

  if (saved?.moved) {
    const msg: PointMessage = {
      deliveryId: batch.deliveryId,
      lat: saved.newest.lat,
      lng: saved.newest.lng,
      heading: saved.newest.heading,
      speed: saved.newest.speed,
      accuracy: saved.newest.accuracy,
      at: new Date(saved.newest.at).toISOString(),
    };
    await publish(trackChannel(saved.d.tracking_code), "point", msg);
    await publish(businessChannel(saved.d.business_id), "point", msg);
  }
  return { accepted: points.length, dropped: batch.points.length - points.length };
}

export type TrailPoint = { id: number; lat: number; lng: number };

/** The trail after a cursor, thinned to at most `max` points so a long trip stays light to send. */
async function trail(deliveryId: string, afterId = 0, max = 400): Promise<TrailPoint[]> {
  const rows = await q<TrailPoint>(
    "SELECT id, lat, lng FROM delivery_points WHERE delivery_id = $1 AND id > $2 ORDER BY id",
    [deliveryId, afterId],
  );
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: TrailPoint[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]!);
  out.push(rows[rows.length - 1]!);
  return out;
}

// ── The customer's tracking page ────────────────────────────────────────────

export type PublicTracking = {
  code: string;
  status: DeliveryStatus;
  statusLabel: string;
  steps: { status: DeliveryStatus; label: string; at: string | null; done: boolean; current: boolean }[];
  business: { name: string; phone: string };
  rider: { firstName: string; vehicle: string; plate: string | null } | null;
  customerFirstName: string;
  package: string;
  pickup: LatLng;
  dropoff: LatLng & { address: string };
  /** Shown only until the handover. */
  otp: string | null;
  otpLocked: boolean;
  /** Present only while the parcel is out. */
  position: (LatLng & { heading: number | null; speed: number | null; at: string; accuracy: number | null }) | null;
  trail: TrailPoint[];
  etaMinutes: number | null;
  simulated: boolean;
  reason: string | null;
  proofPhotoUrl: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

/**
 * Everything the customer needs, and nothing more. The tracking code is the
 * key, so this deliberately leaves out: the customer's own phone number, the
 * rider's phone and surname, other deliveries, and (after the handover) the
 * rider's position and route.
 */
export async function getPublicTracking(code: string, afterPointId = 0): Promise<PublicTracking> {
  const d = await q1<{
    id: string; status: DeliveryStatus; customer_name: string; package: string; otp: string; otp_attempts: number;
    pickup_lat: number; pickup_lng: number; dropoff_address: string; dropoff_lat: number; dropoff_lng: number;
    last_lat: number | null; last_lng: number | null; last_heading: number | null; last_speed_mps: number | null;
    last_accuracy_m: number | null; last_point_at: Date | null; simulated: boolean; reason: string | null;
    proof_photo_url: string | null; finished_at: Date | null; updated_at: Date;
    assigned_at: Date | null; picked_up_at: Date | null; arrived_at: Date | null;
    business_name: string; business_phone: string; rider_name: string | null; vehicle: string | null; plate: string | null;
  }>(
    `SELECT d.id, d.status, d.customer_name, d.package, d.otp, d.otp_attempts,
            d.pickup_lat, d.pickup_lng, d.dropoff_address, d.dropoff_lat, d.dropoff_lng,
            d.last_lat, d.last_lng, d.last_heading, d.last_speed_mps, d.last_accuracy_m, d.last_point_at,
            d.simulated, d.reason, d.proof_photo_url, d.finished_at, d.updated_at,
            d.assigned_at, d.picked_up_at, d.arrived_at,
            b.name AS business_name, b.phone AS business_phone,
            ru.name AS rider_name, r.vehicle, r.plate
       FROM deliveries d
       JOIN businesses b ON b.user_id = d.business_id
       LEFT JOIN users ru ON ru.id = d.rider_id
       LEFT JOIN riders r ON r.user_id = d.rider_id
      WHERE d.tracking_code = $1`,
    [code],
  );
  if (!d) throw new NotFoundError("That tracking code");

  const live = LIVE_STATUSES.includes(d.status);
  const position =
    live && d.last_lat !== null && d.last_lng !== null && d.last_point_at
      ? { lat: d.last_lat, lng: d.last_lng, heading: d.last_heading, speed: d.last_speed_mps, at: d.last_point_at.toISOString(), accuracy: d.last_accuracy_m }
      : null;
  const dropoff = { lat: d.dropoff_lat, lng: d.dropoff_lng };
  const finished = d.finished_at !== null;

  const at: Partial<Record<DeliveryStatus, Date | null>> = {
    assigned: d.assigned_at, picked_up: d.picked_up_at, arrived: d.arrived_at,
    delivered: d.status === "delivered" ? d.finished_at : null,
  };
  const reached = TIMELINE.indexOf(d.status);
  const steps = TIMELINE.map((s, i) => ({
    status: s,
    label: STATUS_LABEL[s],
    at: at[s]?.toISOString() ?? null,
    // A failed trip still shows how far it got (the steps that have a time).
    done: (reached >= 0 && i <= reached) || Boolean(at[s]),
    current: i === reached,
  }));

  return {
    code,
    status: d.status,
    statusLabel: STATUS_LABEL[d.status],
    steps,
    business: { name: d.business_name, phone: d.business_phone },
    rider: d.rider_name && d.status !== "pending"
      ? { firstName: d.rider_name.split(" ")[0]!, vehicle: d.vehicle ?? "", plate: d.plate }
      : null,
    customerFirstName: d.customer_name.split(" ")[0]!,
    package: d.package,
    pickup: { lat: d.pickup_lat, lng: d.pickup_lng },
    dropoff: { ...dropoff, address: d.dropoff_address },
    otp: finished ? null : d.otp,
    otpLocked: d.otp_attempts >= 5,
    position,
    trail: live ? await trail(d.id, afterPointId) : [],
    etaMinutes: position && d.status === "picked_up" ? etaMinutes(position, dropoff, d.vehicle ?? "motorbike", d.last_speed_mps) : null,
    simulated: d.simulated,
    reason: d.status === "failed" || d.status === "cancelled" ? d.reason : null,
    proofPhotoUrl: d.status === "delivered" ? d.proof_photo_url : null,
    finishedAt: d.finished_at?.toISOString() ?? null,
    updatedAt: d.updated_at.toISOString(),
  };
}

// ── The business's live map ─────────────────────────────────────────────────

export type LiveTrip = {
  id: string;
  tracking_code: string;
  status: DeliveryStatus;
  customer_name: string;
  rider_name: string;
  vehicle: string;
  dropoff_lat: number;
  dropoff_lng: number;
  last_lat: number | null;
  last_lng: number | null;
  last_heading: number | null;
  last_speed_mps: number | null;
  last_point_at: Date | null;
};

/** Every trip of this business that's on the road right now. */
export async function businessLive(actor: Actor | null): Promise<LiveTrip[]> {
  const me = mustBe(actor, "business");
  return q<LiveTrip>(
    `SELECT d.id, d.tracking_code, d.status, d.customer_name, u.name AS rider_name, r.vehicle,
            d.dropoff_lat, d.dropoff_lng, d.last_lat, d.last_lng, d.last_heading, d.last_speed_mps, d.last_point_at
       FROM deliveries d JOIN users u ON u.id = d.rider_id JOIN riders r ON r.user_id = d.rider_id
      WHERE d.business_id = $1 AND d.status IN ('picked_up', 'arrived')
      ORDER BY d.picked_up_at`,
    [me.id],
  );
}

/** The trail of one of this business's deliveries (for its detail page). */
export async function businessTrail(actor: Actor | null, deliveryId: string): Promise<TrailPoint[]> {
  const me = mustBe(actor, "business");
  const owned = await q1("SELECT 1 FROM deliveries WHERE id = $1 AND business_id = $2", [deliveryId, me.id]);
  if (!owned) throw new NotFoundError("That delivery");
  return trail(deliveryId);
}

// ── Road routes for simulated trips ─────────────────────────────────────────

/**
 * A road route between two points from the public OSRM demo server (built on
 * OpenStreetMap). If it's slow or unreachable we fall back to a gently curved
 * line, so the simulation always works.
 */
export async function roadRoute(from: LatLng, to: LatLng): Promise<{ path: LatLng[]; source: "osrm" | "estimate" }> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "WoOna-delivery-tracker/1.0 (portfolio demo)" },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (coords && coords.length >= 2) return { path: coords.map(([lng, lat]) => ({ lat, lng })), source: "osrm" };
    }
  } catch {
    // fall through to the estimate
  }
  return { path: curvedPath(from, to), source: "estimate" };
}

/**
 * The route the simulator drives for one of the rider's trips: from where the
 * rider is now (or the pickup) to the drop-off. Cached on the delivery so a
 * page refresh resumes the same route instead of asking OSRM again.
 */
export async function simulationRoute(actor: Actor | null, deliveryId: string): Promise<LatLng[]> {
  const me = mustBe(actor, "rider");
  if (!canSimulate(me)) throw new ForbiddenError("Simulated trips are turned off for this account.");
  const d = await q1<{ status: DeliveryStatus; route: [number, number][] | null; pickup_lat: number; pickup_lng: number; dropoff_lat: number; dropoff_lng: number; last_lat: number | null; last_lng: number | null }>(
    `SELECT status, route, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, last_lat, last_lng
       FROM deliveries WHERE id = $1 AND rider_id = $2`,
    [deliveryId, me.id],
  );
  if (!d) throw new NotFoundError("That trip");
  if (!LIVE_STATUSES.includes(d.status)) throw new ConflictError("Start the trip first.");
  const dropoff = { lat: d.dropoff_lat, lng: d.dropoff_lng };
  if (d.route && d.route.length >= 2) return d.route.map(([lat, lng]) => ({ lat, lng }));
  const from = d.last_lat !== null && d.last_lng !== null ? { lat: d.last_lat, lng: d.last_lng } : { lat: d.pickup_lat, lng: d.pickup_lng };
  const { path } = await roadRoute(from, dropoff);
  await q("UPDATE deliveries SET route = $2 WHERE id = $1", [deliveryId, JSON.stringify(path.map((p) => [round6(p.lat), round6(p.lng)]))]);
  return path;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
