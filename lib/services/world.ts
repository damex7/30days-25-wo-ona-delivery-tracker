// Builds a complete delivery business (owner, riders, deliveries, history and a
// live trip with a GPS trail) from a plain description. The demo mode and the
// seed script both use it, so they always produce the same kind of data.
import { randomBytes } from "node:crypto";
import type { Queryable } from "../db";
import { newFleetCode, newOtp, newTrackingCode } from "../codes";
import { LANDMARKS } from "../constants";
import { type LatLng, resample } from "../geo";

export const place = (name: string) => {
  const p = LANDMARKS.find((l) => l.name.startsWith(name));
  if (!p) throw new Error(`Unknown landmark ${name}`);
  return p;
};
type Place = { name: string; lat: number; lng: number };

export type WorldSpec = {
  isDemo: boolean;
  passwordHash: string | null;
  owner: { name: string; email?: string };
  business: { name: string; phone: string; state: string; city: string; fleetCode?: string; shop: Place; shopLabel: string };
  riders: { key: string; name: string; email?: string; phone: string; vehicle: string; plate: string }[];
  deliveries: {
    rider: string | null;
    status: "pending" | "assigned" | "picked_up" | "delivered" | "failed";
    customer: string;
    phone: string;
    pkg: string;
    notes?: string;
    fee: number; // naira
    to: Place;
    minutesAgo: number;
    reason?: string;
    /** For a live trip: the road route and how much of it is already driven. */
    route?: LatLng[];
    progress?: number;
  }[];
};

async function user(db: Queryable, spec: WorldSpec, role: "business" | "rider", name: string, email?: string) {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (name, email, password_hash, role, is_demo) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [name, email ?? `demo+${role}-${randomBytes(5).toString("hex")}@example.com`, spec.isDemo ? null : spec.passwordHash, role, spec.isDemo],
  );
  return rows[0]!.id;
}

/** Returns the business owner's user id and each rider's id by key. */
export async function buildWorld(db: Queryable, spec: WorldSpec) {
  const biz = await user(db, spec, "business", spec.owner.name, spec.owner.email);
  const b = spec.business;
  await db.query(
    `INSERT INTO businesses (user_id, name, phone, state, city, fleet_code, pickup_address, pickup_lat, pickup_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [biz, b.name, b.phone, b.state, b.city, b.fleetCode ?? newFleetCode(), b.shopLabel, b.shop.lat, b.shop.lng],
  );

  const riders: Record<string, { id: string; first: string }> = {};
  for (const r of spec.riders) {
    const id = await user(db, spec, "rider", r.name, r.email);
    await db.query(
      "INSERT INTO riders (user_id, business_id, phone, vehicle, plate) VALUES ($1, $2, $3, $4, $5)",
      [id, biz, r.phone, r.vehicle, r.plate],
    );
    riders[r.key] = { id, first: r.name.split(" ")[0]! };
  }

  for (const x of spec.deliveries) {
    const rider = x.rider ? riders[x.rider]! : null;
    // Times are "minutes ago", turned into SQL intervals. They're numbers we
    // wrote ourselves, never user input, so building them into SQL is safe.
    const ago = (m: number | null) => (m === null ? "NULL" : `now() - interval '${Math.max(0, Math.round(m))} minutes'`);
    const created = x.minutesAgo;
    const assigned = rider ? created - 2 : null;
    const out = x.status === "picked_up" || x.status === "delivered" || x.status === "failed";
    const picked = out ? created - 6 : null;
    const finished = x.status === "delivered" || x.status === "failed" ? created - 40 : null;
    const arrived = x.status === "delivered" ? created - 38 : null;

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO deliveries (business_id, rider_id, tracking_code, status, customer_name, customer_phone, package, notes,
                               fee_kobo, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                               otp, reason, simulated, created_at, assigned_at, picked_up_at, arrived_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               ${ago(created)}, ${ago(assigned)}, ${ago(picked)}, ${ago(arrived)}, ${ago(finished)})
       RETURNING id`,
      [
        biz, rider?.id ?? null, newTrackingCode(), x.status, x.customer, x.phone, x.pkg, x.notes ?? "", x.fee * 100,
        b.shopLabel, b.shop.lat, b.shop.lng, x.to.name, x.to.lat, x.to.lng, newOtp(), x.reason ?? null,
        // A trail we generated is a simulation, and the tracking page says so.
        x.status === "picked_up",
      ],
    );
    const id = rows[0]!.id;
    const ev = async (status: string, note: string, actor: string | null, at: number) =>
      db.query(
        `INSERT INTO delivery_events (delivery_id, status, note, actor_id, created_at) VALUES ($1, $2, $3, $4, ${ago(at)})`,
        [id, status, note, actor],
      );
    await ev("pending", "Delivery created", biz, created);
    if (rider && assigned !== null) await ev("assigned", `Assigned to ${rider.first}`, biz, assigned);
    if (rider && picked !== null) await ev("picked_up", "Parcel collected; on the way", rider.id, picked);
    if (rider && x.status === "delivered") await ev("delivered", "Handed over; customer confirmed with their code", rider.id, finished!);
    if (rider && x.status === "failed") await ev("failed", x.reason ?? "Couldn't deliver", rider.id, finished!);
    if (x.status === "picked_up" && x.route) await seedTrail(db, id, x.route, x.progress ?? 0.35);
  }
  return { businessId: biz, riders };
}

/**
 * Give a live trip some history: the first `fraction` of the route as GPS
 * points spaced about 4 seconds apart, ending 15 seconds ago. The route is
 * cached on the delivery so the simulator carries on along the same roads.
 */
export async function seedTrail(db: Queryable, deliveryId: string, path: LatLng[], fraction: number) {
  const pts = resample(path, 35); // ~35 m apart: a motorbike at 30 km/h, every 4 seconds
  const done = pts.slice(0, Math.max(2, Math.floor(pts.length * fraction)));
  const end = Date.now() - 15_000;
  const times = done.map((_, i) => new Date(end - (done.length - 1 - i) * 4_000).toISOString());
  await db.query(
    `INSERT INTO delivery_points (delivery_id, lat, lng, accuracy_m, speed_mps, recorded_at)
     SELECT $1, lat, lng, 8, 8.3, at FROM unnest($2::float8[], $3::float8[], $4::timestamptz[]) AS t(lat, lng, at)`,
    [deliveryId, done.map((p) => p.lat), done.map((p) => p.lng), times],
  );
  const last = done[done.length - 1]!;
  await db.query(
    `UPDATE deliveries SET last_lat = $2, last_lng = $3, last_accuracy_m = 8, last_speed_mps = 8.3,
            last_point_at = $4, route = $5 WHERE id = $1`,
    [deliveryId, last.lat, last.lng, times[times.length - 1], JSON.stringify(path.map((p) => [p.lat, p.lng]))],
  );
}

/** The demo world: a Yaba errand business with three riders and five deliveries. */
export function demoSpec(liveRoute: LatLng[]): WorldSpec {
  const shop = place("Yaba Market");
  return {
    isDemo: true,
    passwordHash: null,
    owner: { name: "Demo Owner" },
    business: { name: "Swift Errands (demo)", phone: "+2348030000001", state: "Lagos", city: "Yaba", shop, shopLabel: `Shop 14, ${shop.name}` },
    riders: [
      { key: "musa", name: "Musa Ibrahim (demo)", phone: "+2348101112222", vehicle: "motorbike", plate: "LND-482-KJ" },
      { key: "tunde", name: "Tunde Bakare (demo)", phone: "+2348102223333", vehicle: "motorbike", plate: "KJA-119-YB" },
      { key: "ngozi", name: "Ngozi Eze (demo)", phone: "+2348103334444", vehicle: "car", plate: "EKY-552-AA" },
    ],
    deliveries: [
      // Musa's job is the one to drive with "Simulate ride": short, so it finishes in about a minute.
      { rider: "musa", status: "assigned", customer: "Adaeze Okoro", phone: "+2348031112233", pkg: "Laptop charger", notes: "Call when you reach the main gate.", fee: 1500, to: place("University of Lagos"), minutesAgo: 9 },
      { rider: "tunde", status: "picked_up", customer: "Femi Adebayo", phone: "+2348092223344", pkg: "2 phone cases and a screen guard", fee: 3500, to: place("Ikeja City Mall"), minutesAgo: 26, route: liveRoute, progress: 0.38 },
      { rider: null, status: "pending", customer: "Halima Sani", phone: "+2347033334455", pkg: "Small cake box (handle gently)", fee: 2000, to: place("National Stadium"), minutesAgo: 4 },
      { rider: "ngozi", status: "delivered", customer: "Kelechi Nwosu", phone: "+2348104445566", pkg: "Office documents (A4 envelope)", fee: 4000, to: place("Lekki Phase 1"), minutesAgo: 190 },
      { rider: "tunde", status: "failed", customer: "Bisi Alade", phone: "+2349015556677", pkg: "Ankara fabric, 6 yards", fee: 2500, to: place("Balogun Market"), minutesAgo: 300, reason: "Customer not reachable on the phone after 3 calls" },
    ],
  };
}
