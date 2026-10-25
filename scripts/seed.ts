// npm run db:seed
// Two real (non-demo) businesses with riders and deliveries in every status,
// plus an admin. Safe to run again: it deletes the seed accounts first.
import "./env";
process.env.EMAIL_LOG = "off";

import { hashPassword } from "../lib/auth/password";
import { pool, q, tx } from "../lib/db";
import { roadRoute } from "../lib/services/tracking";
import { buildWorld, place } from "../lib/services/world";

const SEED_EMAILS = [
  "swift@example.com", "musa@example.com", "tunde@example.com", "ngozi@example.com",
  "coalcity@example.com", "chinedu@example.com", "amaka@example.com", "admin@example.com",
];

async function main() {
  const userPw = process.env.SEED_USER_PASSWORD;
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  if (!userPw || userPw.length < 8 || !adminPw || adminPw.length < 8)
    throw new Error("Set SEED_USER_PASSWORD and SEED_ADMIN_PASSWORD (8+ characters) in .env.local first.");

  // Road routes for the two live trips (falls back to a curved line offline).
  const lagosRoute = await roadRoute(place("Yaba Market"), place("Ikeja City Mall"));
  const enuguRoute = await roadRoute(place("Polo Park"), place("UNN Enugu"));
  console.log(`routes: Lagos ${lagosRoute.source}, Enugu ${enuguRoute.source}`);

  const userHash = await hashPassword(userPw);
  const adminHash = await hashPassword(adminPw);

  await tx(async (db) => {
    // Deleting the users cascades to their businesses, riders and deliveries.
    await db.query("DELETE FROM users WHERE email = ANY($1::citext[])", [SEED_EMAILS]);

    const yaba = place("Yaba Market");
    await buildWorld(db, {
      isDemo: false,
      passwordHash: userHash,
      owner: { name: "Adaobi Nwankwo", email: "swift@example.com" },
      business: { name: "Swift Errands Lagos", phone: "+2348031230001", state: "Lagos", city: "Yaba", fleetCode: "SWFT24", shop: yaba, shopLabel: `Shop 14, ${yaba.name}` },
      riders: [
        { key: "musa", name: "Musa Ibrahim", email: "musa@example.com", phone: "+2348051110001", vehicle: "motorbike", plate: "LND-482-KJ" },
        { key: "tunde", name: "Tunde Bakare", email: "tunde@example.com", phone: "+2348051110002", vehicle: "motorbike", plate: "KJA-119-YB" },
        { key: "ngozi", name: "Ngozi Eze", email: "ngozi@example.com", phone: "+2348051110003", vehicle: "car", plate: "EKY-552-AA" },
      ],
      deliveries: [
        { rider: "musa", status: "assigned", customer: "Adaeze Okoro", phone: "+2348031112233", pkg: "Laptop charger", notes: "Call when you reach the main gate.", fee: 1500, to: place("University of Lagos"), minutesAgo: 12 },
        { rider: "tunde", status: "picked_up", customer: "Femi Adebayo", phone: "+2348092223344", pkg: "2 phone cases and a screen guard", fee: 3500, to: place("Ikeja City Mall"), minutesAgo: 25, route: lagosRoute.path, progress: 0.4 },
        { rider: null, status: "pending", customer: "Halima Sani", phone: "+2347033334455", pkg: "Small cake box (handle gently)", fee: 2000, to: place("National Stadium"), minutesAgo: 5 },
        { rider: null, status: "pending", customer: "Obinna Uche", phone: "+2348067778899", pkg: "Pair of sneakers (size 43)", fee: 2500, to: place("Computer Village"), minutesAgo: 2 },
        { rider: "ngozi", status: "delivered", customer: "Kelechi Nwosu", phone: "+2348104445566", pkg: "Office documents (A4 envelope)", fee: 4000, to: place("Lekki Phase 1"), minutesAgo: 190 },
        { rider: "musa", status: "delivered", customer: "Yetunde Ajayi", phone: "+2348025556677", pkg: "Hair products (2 bottles)", fee: 1800, to: place("Eko Hotel"), minutesAgo: 140 },
        { rider: "tunde", status: "failed", customer: "Bisi Alade", phone: "+2349015556677", pkg: "Ankara fabric, 6 yards", fee: 2500, to: place("Balogun Market"), minutesAgo: 300, reason: "Customer not reachable on the phone after 3 calls" },
      ],
    });

    const polo = place("Polo Park");
    await buildWorld(db, {
      isDemo: false,
      passwordHash: userHash,
      owner: { name: "Emeka Obi", email: "coalcity@example.com" },
      business: { name: "Coal City Couriers", phone: "+2348091230002", state: "Enugu", city: "Enugu", fleetCode: "ENUGU7", shop: polo, shopLabel: `Ground floor, ${polo.name}` },
      riders: [
        { key: "chinedu", name: "Chinedu Okafor", email: "chinedu@example.com", phone: "+2348061110004", vehicle: "motorbike", plate: "ENU-301-AB" },
        { key: "amaka", name: "Amaka Eze", email: "amaka@example.com", phone: "+2348061110005", vehicle: "tricycle", plate: "ENU-882-KE" },
      ],
      deliveries: [
        { rider: "chinedu", status: "picked_up", customer: "Ifeoma Chukwu", phone: "+2348033211122", pkg: "Textbooks (3)", fee: 1200, to: place("UNN Enugu"), minutesAgo: 14, route: enuguRoute.path, progress: 0.5 },
        { rider: "amaka", status: "assigned", customer: "Nnamdi Eze", phone: "+2348073344556", pkg: "Bag of rice (10 kg)", fee: 2500, to: place("Independence Layout"), minutesAgo: 8 },
        { rider: null, status: "pending", customer: "Chiamaka Ani", phone: "+2349083344557", pkg: "Phone (sealed box)", fee: 1500, to: place("Ogbete Main Market"), minutesAgo: 3 },
        { rider: "amaka", status: "delivered", customer: "Uchenna Okeke", phone: "+2348183344558", pkg: "Gas regulator", fee: 1000, to: place("Ogbete Main Market"), minutesAgo: 200 },
      ],
    });

    await db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ('Site Admin', 'admin@example.com', $1, 'admin')",
      [adminHash],
    );
  });

  const counts = await q<{ role: string; n: number }>("SELECT role, count(*)::int AS n FROM users WHERE NOT is_demo GROUP BY role ORDER BY role");
  console.log("Seeded:", counts.map((c) => `${c.n} ${c.role}`).join(", "));
  await pool().end();
}

main().catch(async (err) => {
  console.error(err);
  await pool().end().catch(() => {});
  process.exit(1);
});
