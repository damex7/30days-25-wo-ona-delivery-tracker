// Demo mode (the Day 20/24 pattern): one click gives a visitor their OWN small
// delivery business, with riders and deliveries, and no password. Everything is
// marked is_demo and deleted after 24 hours. Every foreign key cascades, so
// deleting the demo users removes their whole world in one statement.
import { q, tx } from "../db";
import { type Actor } from "./actor";
import { ForbiddenError, NotFoundError } from "./errors";
import { roadRoute } from "./tracking";
import { buildWorld, demoSpec, place } from "./world";

/** Remove demo worlds older than a day. Safe to run any time, any number of times. */
export async function cleanupDemoData(): Promise<number> {
  const rows = await q("DELETE FROM users WHERE is_demo AND created_at < now() - interval '24 hours' RETURNING id");
  return rows.length;
}

/**
 * Builds a fresh demo world and returns the business owner's id. The road
 * route for the live trip is fetched BEFORE the transaction opens, so a slow
 * route service never holds database locks.
 */
export async function startDemo(): Promise<string> {
  await cleanupDemoData();
  const { path } = await roadRoute(place("Yaba Market"), place("Ikeja City Mall"));
  return tx(async (db) => (await buildWorld(db, demoSpec(path))).businessId);
}

// ── Switching between the people in one demo world ───────────────────────────

export type DemoMember = { id: string; name: string; role: "business" | "rider"; current: boolean };

/** The business and riders of the visitor's demo world (empty for real accounts). */
export async function demoMembers(actor: Actor | null): Promise<DemoMember[]> {
  if (!actor?.isDemo) return [];
  return q<DemoMember>(
    `WITH fleet AS (
       SELECT CASE WHEN $2::text = 'business' THEN $1::uuid
                   ELSE (SELECT business_id FROM riders WHERE user_id = $1) END AS id
     )
     SELECT u.id, u.name, u.role, u.id = $1 AS current
       FROM users u, fleet
      WHERE u.is_demo AND u.suspended_at IS NULL
        AND (u.id = fleet.id OR u.id IN (SELECT user_id FROM riders WHERE business_id = fleet.id))
      ORDER BY u.role, u.name`,
    [actor.id, actor.role],
  );
}

/**
 * "Continue as Musa": only between members of the SAME demo world. A real
 * account can never switch, and a demo visitor can't reach anyone else's demo.
 */
export async function checkDemoSwitch(actor: Actor | null, targetId: string): Promise<{ id: string; role: "business" | "rider" }> {
  if (!actor?.isDemo) throw new ForbiddenError("Only demo accounts can switch people.");
  const target = (await demoMembers(actor)).find((m) => m.id === targetId);
  if (!target) throw new NotFoundError("That demo account");
  return { id: target.id, role: target.role };
}

