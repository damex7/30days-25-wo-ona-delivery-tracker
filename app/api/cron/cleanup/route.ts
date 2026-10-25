// GET /api/cron/cleanup, run daily by Vercel Cron (see vercel.json).
// 1. Deletes demo worlds older than 24 hours.
// 2. Deletes GPS trails of deliveries that finished over 7 days ago: once the
//    parcel is delivered, nobody needs a minute-by-minute record of where the
//    rider was. The delivery itself (status, times, history) is kept.
import { connection } from "next/server";
import { json } from "@/lib/api";
import { q } from "@/lib/db";
import { cleanupDemoData } from "@/lib/services/demo";

export async function GET(req: Request) {
  await connection(); // per-request, never prerendered at build time
  // Vercel sends "Authorization: Bearer <CRON_SECRET>"; anyone else is refused.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
  const demos = await cleanupDemoData();
  const trails = await q(
    `DELETE FROM delivery_points p USING deliveries d
      WHERE p.delivery_id = d.id AND d.finished_at < now() - interval '7 days' RETURNING p.id`,
  );
  await q("UPDATE deliveries SET route = NULL WHERE route IS NOT NULL AND finished_at < now() - interval '7 days'");
  await q("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
  await q("DELETE FROM sessions WHERE expires_at < now()");
  return json({ demoUsersDeleted: demos, trailPointsDeleted: trails.length });
}
