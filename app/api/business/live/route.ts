// GET /api/business/live: this business's trips on the road right now.
// The live map's polling fallback (and its refresh after a status change).
import { connection } from "next/server";
import { apiError, json } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { businessLive } from "@/lib/services/tracking";

export async function GET() {
  await connection(); // per-request, never prerendered at build time
  try {
    return json({ trips: await businessLive(await currentActor()) });
  } catch (e) {
    return apiError(e);
  }
}
