// npm run check:rules
// Runs the real service functions against the real database and prints PASS
// or FAIL for each ownership, status, race and privacy rule. It creates its own
// throwaway businesses and riders (marked is_demo) and deletes them at the end.
import "./env";
process.env.EMAIL_LOG = "off";

import { randomUUID } from "node:crypto";
import { pool, q, q1 } from "../lib/db";
import { actorFromToken, createSessionRow } from "../lib/auth/sessions";
import { registerUser } from "../lib/services/accounts";
import type { Actor } from "../lib/services/actor";
import { adminOverview } from "../lib/services/admin";
import {
  acceptJob, assignDelivery, cancelDelivery, confirmDelivery, createDelivery, failDelivery,
  getBusinessDelivery, getRiderTrip, listBusinessDeliveries, markArrived, releaseJob, resetOtp,
  riderBoard, startTrip,
} from "../lib/services/deliveries";
import { checkDemoSwitch, startDemo } from "../lib/services/demo";
import { ConflictError, ForbiddenError, NotFoundError, RuleError } from "../lib/services/errors";
import { pauseRider } from "../lib/services/fleet";
import { getPublicTracking, recordPoints } from "../lib/services/tracking";
import { deliverySchema, locationBatchSchema, signupSchema } from "../lib/validation";
import { parseTrackingCode } from "../lib/tracking-code";
import { normalizeNgPhone } from "../lib/phone";

let passed = 0, failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function rejects(p: Promise<unknown>, type: new (...a: never[]) => Error, label: string) {
  try {
    await p;
  } catch (e) {
    if (e instanceof type) return;
    throw new Error(`${label}: expected ${type.name}, got ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : e}`);
  }
  throw new Error(`${label}: expected ${type.name}, but it succeeded`);
}

const tag = randomUUID().slice(0, 6);
const created: string[] = [];

/** A throwaway business with its own fleet. */
async function business(name: string): Promise<Actor & { fleet: string }> {
  const email = `check-${tag}-${name.toLowerCase()}@example.com`;
  const u = await registerUser(signupSchema.parse({
    role: "business", name: `${name} Owner`, email, password: "check-password-1",
    businessName: `${name} Errands`, phone: "0803 000 0000", state: "Lagos", city: "Yaba",
  }));
  created.push(u.id);
  await q("UPDATE users SET is_demo = true WHERE id = $1", [u.id]);
  const b = await q1<{ fleet_code: string }>("SELECT fleet_code FROM businesses WHERE user_id = $1", [u.id]);
  return { id: u.id, name: `${name} Owner`, email, role: "business", isDemo: true, fleet: b!.fleet_code };
}

/** A rider in a fleet. (Signing up with a fleet code is checked separately.) */
async function rider(biz: { id: string }, name: string): Promise<Actor> {
  const email = `check-${tag}-${name.toLowerCase()}@example.com`;
  const u = await q1<{ id: string }>(
    "INSERT INTO users (name, email, role, is_demo) VALUES ($1, $2, 'rider', true) RETURNING id",
    [name, email],
  );
  await q("INSERT INTO riders (user_id, business_id, phone, vehicle) VALUES ($1, $2, '+2348050000000', 'motorbike')", [u!.id, biz.id]);
  created.push(u!.id);
  return { id: u!.id, name, email, role: "rider", isDemo: true };
}

const yaba = { lat: 6.5085, lng: 3.3694 };
const unilag = { lat: 6.5158, lng: 3.3896 };
const input = (over: Partial<Record<string, string>> = {}) =>
  deliverySchema.parse({
    customerName: "Ada Customer", customerPhone: "08031112233", package: "Shoes", notes: "", fee: "1500",
    pickupAddress: "Yaba Market", pickupLat: String(yaba.lat), pickupLng: String(yaba.lng),
    dropoffAddress: "UNILAG", dropoffLat: String(unilag.lat), dropoffLng: String(unilag.lng), riderId: "",
    ...over,
  });
const point = (p: { lat: number; lng: number }, at = Date.now(), accuracy = 8) => ({ ...p, accuracy, heading: null, speed: null, at });

async function main() {
  console.log("Wo Ọ̀nà rule checks\n");
  const A = await business("Alpha");
  const B = await business("Bravo");
  const a1 = await rider(A, "Ade");
  const a2 = await rider(A, "Amaka");
  const b1 = await rider(B, "Bello");
  const admin: Actor = { id: randomUUID(), name: "Admin", email: "x", role: "admin", isDemo: false };

  console.log("Ownership: each business sees only its own deliveries");
  const dA = await createDelivery(A, input());
  await check("business B can't open business A's delivery (404, not 403)", () => rejects(getBusinessDelivery(B, dA.id), NotFoundError, "get"));
  await check("business B can't assign, cancel or reset A's delivery", async () => {
    await rejects(assignDelivery(B, dA.id, b1.id), NotFoundError, "assign");
    await rejects(cancelDelivery(B, dA.id, "nope"), NotFoundError, "cancel");
    await rejects(resetOtp(B, dA.id), NotFoundError, "reset");
  });
  await check("business B's list doesn't include A's delivery", async () => {
    const list = await listBusinessDeliveries(B, { view: "all" });
    assert(!list.some((d) => d.id === dA.id), "B's list leaked A's delivery");
  });
  await check("A can't hand a delivery to B's rider (service check)", () => rejects(assignDelivery(A, dA.id, b1.id), RuleError, "assign other fleet"));
  await check("…and the database itself refuses it (composite foreign key)", async () => {
    try {
      await q("UPDATE deliveries SET rider_id = $2, status = 'assigned' WHERE id = $1", [dA.id, b1.id]);
    } catch (e) {
      assert((e as { code?: string }).code === "23503", `expected a foreign-key error, got ${(e as Error).message}`);
      return;
    }
    throw new Error("the database accepted another fleet's rider");
  });
  await check("a rider can't use the business tools", () => rejects(createDelivery(a1, input()), ForbiddenError, "rider create"));
  await check("a business can't call the admin panel", () => rejects(adminOverview(A), ForbiddenError, "admin"));
  await check("admin overview works for an admin", async () => {
    const o = await adminOverview(admin);
    assert(typeof o.totals.businesses === "number", "no totals");
  });

  console.log("\nThe job board");
  await check("riders only see their own fleet's open jobs", async () => {
    const boardB = await riderBoard(b1);
    assert(!boardB.open.some((j) => j.id === dA.id), "B's rider sees A's job");
    const boardA = await riderBoard(a1);
    assert(boardA.open.some((j) => j.id === dA.id), "A's rider doesn't see A's job");
  });
  await check("a rider from another fleet can't take the job (404)", () => rejects(acceptJob(b1, dA.id), NotFoundError, "accept other fleet"));
  await check("an off-duty rider can't take jobs", async () => {
    await q("UPDATE riders SET on_duty = false WHERE user_id = $1", [a2.id]);
    await rejects(acceptJob(a2, dA.id), RuleError, "off duty");
    await q("UPDATE riders SET on_duty = true WHERE user_id = $1", [a2.id]);
  });
  await check("10 riders tapping 'Take job' at once: exactly one gets it", async () => {
    const crowd = [a1, a2];
    for (let i = 0; i < 8; i++) crowd.push(await rider(A, `Crowd${i}`));
    const d = await createDelivery(A, input());
    const results = await Promise.allSettled(crowd.map((r) => acceptJob(r, d.id)));
    const won = results.filter((r) => r.status === "fulfilled").length;
    const lost = results.filter((r) => r.status === "rejected" && r.reason instanceof ConflictError).length;
    assert(won === 1 && lost === 9, `won=${won}, conflicts=${lost}`);
  });

  console.log("\nStatus rules");
  const d1 = await createDelivery(A, input({ riderId: a1.id }));
  await check("a delivery can't skip from assigned to delivered", async () => {
    const otp = (await getBusinessDelivery(A, d1.id)).delivery.otp;
    await rejects(confirmDelivery(a1, d1.id, otp, null), ConflictError, "confirm before pickup");
    await rejects(markArrived(a1, d1.id), ConflictError, "arrive before pickup");
  });
  await check("only the assigned rider can start the trip", () => rejects(startTrip(a2, d1.id), NotFoundError, "other rider start"));
  await check("location is refused before the trip starts", () =>
    rejects(recordPoints(a1, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba)] })), ConflictError, "early gps"));
  await check("rider starts the trip", () => startTrip(a1, d1.id));
  await check("a rider can't be on two trips at once (partial unique index)", async () => {
    const d2 = await createDelivery(A, input({ riderId: a1.id }));
    await rejects(startTrip(a1, d2.id), ConflictError, "second trip");
    await releaseJob(a1, d2.id);
  });
  await check("two 'Start trip' taps on two jobs at the same moment: only one starts", async () => {
    const x = await createDelivery(A, input({ riderId: a2.id }));
    const y = await createDelivery(A, input({ riderId: a2.id }));
    const r = await Promise.allSettled([startTrip(a2, x.id), startTrip(a2, y.id)]);
    const ok = r.filter((s) => s.status === "fulfilled").length;
    assert(ok === 1, `${ok} trips started`);
    const live = await q1<{ n: number }>("SELECT count(*)::int AS n FROM deliveries WHERE rider_id = $1 AND status IN ('picked_up','arrived')", [a2.id]);
    assert(live!.n === 1, `${live!.n} live trips in the database`);
  });
  await check("the business can't cancel a parcel that's already out (must mark failed)", () => rejects(cancelDelivery(A, d1.id, "x"), ConflictError, "cancel live"));
  await check("the business can't move a parcel to another rider once collected", () => rejects(assignDelivery(A, d1.id, a2.id), ConflictError, "reassign live"));
  await check("a rider on a trip can't be paused", () => rejects(pauseRider(A, a1.id), ConflictError, "pause live"));

  console.log("\nGPS points");
  await check("another rider can't send location for this trip (404)", () =>
    rejects(recordPoints(a2, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba)] })), NotFoundError, "other rider gps"));
  await check("a business account can't send location", () =>
    rejects(recordPoints(A, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba)] })), ForbiddenError, "business gps"));
  await check("invalid points are rejected by validation", () => {
    const bad = [
      { deliveryId: d1.id, points: [] },
      { deliveryId: d1.id, points: [point({ lat: 200, lng: 3 })] },
      { deliveryId: d1.id, points: Array.from({ length: 21 }, () => point(yaba)) },
      { deliveryId: "not-a-uuid", points: [point(yaba)] },
    ];
    for (const b of bad) assert(!locationBatchSchema.safeParse(b).success, `accepted ${JSON.stringify(b).slice(0, 60)}`);
    return Promise.resolve();
  });
  await check("future, stale and inaccurate points are dropped; good ones saved", async () => {
    const now = Date.now();
    const r = await recordPoints(a1, locationBatchSchema.parse({
      deliveryId: d1.id,
      points: [point(yaba, now - 4000), point(unilag, now + 10 * 60_000), point(yaba, now - 60 * 60_000), point(yaba, now, 900)],
    }), now);
    assert(r.accepted === 1 && r.dropped === 3, `accepted=${r.accepted} dropped=${r.dropped}`);
  });
  await check("an older batch arriving late doesn't pull the rider backwards", async () => {
    const now = Date.now();
    const ahead = { lat: 6.512, lng: 3.38 };
    await recordPoints(a1, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(ahead, now)] }), now);
    await recordPoints(a1, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba, now - 2000)] }), now);
    const d = await q1<{ last_lat: number }>("SELECT last_lat FROM deliveries WHERE id = $1", [d1.id]);
    assert(Math.abs(d!.last_lat - ahead.lat) < 1e-9, "position moved back to an older point");
  });
  await check("a real (non-demo) rider can't send simulated GPS unless allowed", async () => {
    const before = process.env.ALLOW_SIMULATED_TRIPS;
    process.env.ALLOW_SIMULATED_TRIPS = "false";
    await rejects(recordPoints({ ...a1, isDemo: false }, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba)], simulated: true })), ForbiddenError, "sim");
    process.env.ALLOW_SIMULATED_TRIPS = before;
  });

  console.log("\nWhat the customer's tracking page reveals");
  const code = (await getBusinessDelivery(A, d1.id)).delivery.tracking_code;
  await check("while out: position and trail are shown", async () => {
    const t = await getPublicTracking(code);
    assert(t.position !== null && t.trail.length >= 2, "no live position");
    assert(t.otp !== null, "customer can't see their code");
  });
  await check("it never includes phone numbers or the rider's surname", async () => {
    const t = await getPublicTracking(code);
    const text = JSON.stringify(t);
    assert(!text.includes("+2348031112233") && !text.includes("+2348050000000"), "a phone number leaked");
    assert(t.rider?.firstName === "Ade", "rider name wrong");
  });
  await check("a made-up code finds nothing", () => rejects(getPublicTracking("ABCDEFGH"), NotFoundError, "bad code"));
  await check("typed codes are tidied: 'wo-k7qm 4p2x' → 'K7QM4P2X'", async () => {
    assert(parseTrackingCode("wo-k7qm 4p2x") === "K7QM4P2X", "parse");
    assert(parseTrackingCode("K7QM-4P2O") === null, "accepted an O");
  });
  await check("the rider's trip screen never contains the delivery code", async () => {
    const t = await getRiderTrip(a1, d1.id);
    assert(!("otp" in t), "otp leaked to the rider");
  });

  console.log("\nThe handover code");
  await markArrived(a1, d1.id);
  await check("a wrong code is refused and counted", async () => {
    await rejects(confirmDelivery(a1, d1.id, "0000" === (await getBusinessDelivery(A, d1.id)).delivery.otp ? "1111" : "0000", null), RuleError, "wrong code");
    const d = (await getBusinessDelivery(A, d1.id)).delivery;
    assert(d.otp_attempts === 1, `attempts=${d.otp_attempts}`);
  });
  await check("after 5 wrong codes even the right one is refused", async () => {
    const real = (await getBusinessDelivery(A, d1.id)).delivery.otp;
    const wrong = real === "0000" ? "1111" : "0000";
    for (let i = 0; i < 4; i++) await confirmDelivery(a1, d1.id, wrong, null).catch(() => {});
    await rejects(confirmDelivery(a1, d1.id, real, null), ConflictError, "locked");
    const t = await getPublicTracking(code);
    assert(t.otpLocked, "tracking page doesn't say locked");
  });
  await check("the business issues a new code; the new code works", async () => {
    await resetOtp(A, d1.id);
    const fresh = (await getBusinessDelivery(A, d1.id)).delivery;
    assert(fresh.otp_attempts === 0, "attempts not reset");
    await confirmDelivery(a1, d1.id, fresh.otp, null);
    assert((await getBusinessDelivery(A, d1.id)).delivery.status === "delivered", "not delivered");
  });
  await check("confirming twice is refused", () => rejects(confirmDelivery(a1, d1.id, "1234", null), ConflictError, "twice"));
  await check("after delivery: no position, no trail, no code on the tracking page", async () => {
    const t = await getPublicTracking(code);
    assert(t.position === null && t.trail.length === 0 && t.otp === null, "location or code still shown");
  });
  await check("after delivery the rider can't send location any more", () =>
    rejects(recordPoints(a1, locationBatchSchema.parse({ deliveryId: d1.id, points: [point(yaba)] })), ConflictError, "late gps"));
  await check("a proof photo must come from our own Blob folder for this delivery", async () => {
    const d = await createDelivery(A, input({ riderId: a2.id }));
    await rejects(confirmDelivery(a2, d.id, "1234", "https://evil.example.com/x.jpg"), RuleError, "foreign url");
  });

  console.log("\nFailing and cancelling");
  await check("a rider can mark their live trip failed; the trail stops", async () => {
    const live = await q1<{ id: string }>("SELECT id FROM deliveries WHERE rider_id = $1 AND status = 'picked_up'", [a2.id]);
    await failDelivery(a2, live!.id, "Customer not reachable");
    const d = (await getBusinessDelivery(A, live!.id)).delivery;
    assert(d.status === "failed" && d.reason === "Customer not reachable", "not failed");
  });
  await check("pausing a rider returns their uncollected jobs to the board and logs them out", async () => {
    const d = await createDelivery(A, input({ riderId: a2.id }));
    const { token } = await createSessionRow(a2.id);
    await pauseRider(A, a2.id);
    assert((await getBusinessDelivery(A, d.id)).delivery.status === "pending", "job not released");
    assert((await actorFromToken(token)) === null, "paused rider still logged in");
  });
  await check("business B can't pause business A's rider", () => rejects(pauseRider(B, a1.id), NotFoundError, "pause other fleet"));

  console.log("\nSign-up and input checks");
  await check("a rider can only join with a real fleet code", async () => {
    const bad = signupSchema.parse({ role: "rider", name: "New Rider", email: `check-${tag}-new@example.com`, password: "check-password-1", phone: "08051234567", vehicle: "motorbike", plate: "", fleetCode: "ZZZZZZ" });
    await rejects(registerUser(bad), RuleError, "bad fleet code");
  });
  await check("demo fleets don't accept real riders", async () => {
    const bad = signupSchema.parse({ role: "rider", name: "New Rider", email: `check-${tag}-new2@example.com`, password: "check-password-1", phone: "08051234567", vehicle: "motorbike", plate: "", fleetCode: A.fleet });
    await rejects(registerUser(bad), RuleError, "demo fleet join");
  });
  await check("Nigerian phone numbers in any common format become +234…", () => {
    for (const v of ["08031234567", "0803 123 4567", "+234 803 123 4567", "2348031234567", "803-123-4567"])
      assert(normalizeNgPhone(v) === "+2348031234567", `failed on ${v}`);
    for (const v of ["0603123456", "12345", "+447700900123"]) assert(normalizeNgPhone(v) === null, `accepted ${v}`);
    return Promise.resolve();
  });
  await check("a drop-off in the same place as the pickup is refused", () => {
    const r = deliverySchema.safeParse({ ...input(), pickupLat: String(yaba.lat), pickupLng: String(yaba.lng), dropoffLat: String(yaba.lat), dropoffLng: String(yaba.lng), fee: "", riderId: "", customerPhone: "08031112233" });
    assert(!r.success, "accepted pickup == dropoff");
    return Promise.resolve();
  });

  console.log("\nDemo mode");
  await check("a demo visitor can switch only between people in their own demo", async () => {
    const owner1 = await startDemo();
    const owner2 = await startDemo();
    created.push(owner1, owner2);
    const me: Actor = { id: owner1, name: "Demo Owner", email: "", role: "business", isDemo: true };
    const mine = await q1<{ id: string }>("SELECT user_id AS id FROM riders WHERE business_id = $1 LIMIT 1", [owner1]);
    const theirs = await q1<{ id: string }>("SELECT user_id AS id FROM riders WHERE business_id = $1 LIMIT 1", [owner2]);
    const ok = await checkDemoSwitch(me, mine!.id);
    assert(ok.role === "rider", "couldn't switch to own rider");
    await rejects(checkDemoSwitch(me, theirs!.id), NotFoundError, "switch into another demo");
    await rejects(checkDemoSwitch({ ...A, isDemo: false }, mine!.id), ForbiddenError, "real account switch");
    // tidy the riders of these demo worlds too
    created.push(...(await q<{ user_id: string }>("SELECT user_id FROM riders WHERE business_id = ANY($1::uuid[])", [[owner1, owner2]])).map((r) => r.user_id));
  });

  // Clean up: deleting the users cascades to everything they own.
  await q("DELETE FROM users WHERE id = ANY($1::uuid[]) OR email LIKE $2", [created, `check-${tag}-%`]);
  console.log(`\n${passed} passed, ${failed} failed`);
  await pool().end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[]) OR email LIKE $2", [created, `check-${tag}-%`]).catch(() => {});
  await pool().end().catch(() => {});
  process.exit(1);
});
