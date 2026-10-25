// GET /api/rider/trips/:id/route: the road the simulator drives (demo / ALLOW_SIMULATED_TRIPS only).
import { apiError, json } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { simulationRoute } from "@/lib/services/tracking";
import { uuidSchema } from "@/lib/validation";

export async function GET(_req: Request, ctx: RouteContext<"/api/rider/trips/[id]/route">) {
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    return json({ path: await simulationRoute(await currentActor(), id) });
  } catch (e) {
    return apiError(e);
  }
}
