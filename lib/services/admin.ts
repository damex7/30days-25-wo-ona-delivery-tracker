// The admin panel: an overview of every business, and pausing accounts.
import { q, q1, tx } from "../db";
import { type Actor, mustBe } from "./actor";
import { ConflictError, NotFoundError } from "./errors";

export async function adminOverview(actor: Actor | null) {
  mustBe(actor, "admin");
  const [totals, businesses, log] = await Promise.all([
    q1<{ businesses: number; riders: number; live: number; delivered_today: number; demo_worlds: number }>(
      `SELECT (SELECT count(*) FROM businesses b JOIN users u ON u.id = b.user_id WHERE NOT u.is_demo)::int AS businesses,
              (SELECT count(*) FROM riders r JOIN users u ON u.id = r.user_id WHERE NOT u.is_demo)::int AS riders,
              (SELECT count(*) FROM deliveries WHERE status IN ('picked_up', 'arrived'))::int AS live,
              (SELECT count(*) FROM deliveries WHERE status = 'delivered'
                  AND finished_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::int AS delivered_today,
              (SELECT count(*) FROM businesses b JOIN users u ON u.id = b.user_id WHERE u.is_demo)::int AS demo_worlds`,
    ),
    q<{ id: string; name: string; owner: string; email: string; city: string; state: string; suspended: boolean;
        riders: number; active: number; delivered: number; created_at: Date }>(
      `SELECT b.user_id AS id, b.name, u.name AS owner, u.email, b.city, b.state, u.suspended_at IS NOT NULL AS suspended,
              (SELECT count(*) FROM riders r WHERE r.business_id = b.user_id)::int AS riders,
              (SELECT count(*) FROM deliveries d WHERE d.business_id = b.user_id AND d.finished_at IS NULL)::int AS active,
              (SELECT count(*) FROM deliveries d WHERE d.business_id = b.user_id AND d.status = 'delivered')::int AS delivered,
              u.created_at
         FROM businesses b JOIN users u ON u.id = b.user_id
        WHERE NOT u.is_demo
        ORDER BY u.created_at DESC LIMIT 100`,
    ),
    q<{ id: number; action: string; note: string; created_at: Date; admin: string | null; target: string | null }>(
      `SELECT a.id, a.action, a.note, a.created_at, au.name AS admin, tu.name AS target
         FROM admin_actions a LEFT JOIN users au ON au.id = a.admin_id LEFT JOIN users tu ON tu.id = a.target_user_id
        ORDER BY a.id DESC LIMIT 20`,
    ),
  ]);
  return { totals: totals!, businesses, log };
}

/**
 * Pause or unpause a business account. A paused business can't log in, and
 * its fleet code stops accepting new riders. Admins can't pause admins.
 */
export async function setBusinessSuspended(actor: Actor | null, userId: string, suspend: boolean, note: string) {
  const me = mustBe(actor, "admin");
  await tx(async (db) => {
    const { rows } = await db.query<{ role: string; suspended: boolean }>(
      "SELECT role, suspended_at IS NOT NULL AS suspended FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const u = rows[0];
    if (!u || u.role !== "business") throw new NotFoundError("That business");
    if (u.suspended === suspend) throw new ConflictError(suspend ? "Already paused." : "Not paused.");
    await db.query(`UPDATE users SET suspended_at = ${suspend ? "now()" : "NULL"} WHERE id = $1`, [userId]);
    if (suspend) await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await db.query(
      "INSERT INTO admin_actions (admin_id, action, target_user_id, note) VALUES ($1, $2, $3, $4)",
      [me.id, suspend ? "suspend" : "unsuspend", userId, note],
    );
  });
}
