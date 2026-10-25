// GET /api/track/:code?after=123
// The customer's tracking data (what the polling fallback asks for). Public:
// the tracking code is the key. Rate limited per network so nobody can try
// codes in bulk.
import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/session";
import { getPublicTracking } from "@/lib/services/tracking";
import { parseTrackingCode } from "@/lib/tracking-code";

const query = z.object({ after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0).catch(0) });

export async function GET(req: Request, ctx: RouteContext<"/api/track/[code]">) {
  try {
    // 120 a minute is plenty for one tab polling every 3 seconds, and far too
    // few to guess codes (there are about 850 billion).
    if (!(await rateLimit(`track:${await clientIp()}`, 120, 60))) return json({ error: "Too many requests. Slow down a little." }, 429);
    const code = parseTrackingCode((await ctx.params).code);
    if (!code) return json({ error: "That tracking code could not be found." }, 404);
    const { after } = query.parse({ after: new URL(req.url).searchParams.get("after") ?? undefined });
    return json(await getPublicTracking(code, after));
  } catch (e) {
    return apiError(e);
  }
}
