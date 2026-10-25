// POST /api/rider/location  { deliveryId, points: [{ lat, lng, accuracy, heading, speed, at }], simulated }
// The rider's phone sends its GPS fixes here every few seconds during a trip.
import { apiError, json, sameOrigin } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { currentActor } from "@/lib/auth/session";
import { mustBe } from "@/lib/services/actor";
import { recordPoints } from "@/lib/services/tracking";
import { locationBatchSchema } from "@/lib/validation";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  try {
    const me = mustBe(await currentActor(), "rider");
    // A phone sends about one batch every 3 seconds; 60 a minute leaves room
    // for catching up after a dead zone, and stops a runaway loop.
    if (!(await rateLimit(`gps:${me.id}`, 60, 60))) return json({ error: "Sending too fast. Slowing down." }, 429);
    const batch = locationBatchSchema.parse(await req.json());
    return json(await recordPoints(me, batch));
  } catch (e) {
    return apiError(e);
  }
}
