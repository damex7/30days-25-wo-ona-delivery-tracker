// POST /api/pusher/auth  (form fields: socket_id, channel_name)
// Pusher asks this before a browser may listen on a PRIVATE channel. We say yes
// only if the logged-in person owns that channel:
//   private-business-<id>  → that business, and nobody else
//   private-fleet-<id>     → that business's own riders (job-board updates)
import { json, sameOrigin } from "@/lib/api";
import { currentActor } from "@/lib/auth/session";
import { q1 } from "@/lib/db";
import { authorizeChannel } from "@/lib/realtime";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  const actor = await currentActor();
  if (!actor) return json({ error: "Please log in." }, 403);
  const form = new URLSearchParams(await req.text());
  const socketId = form.get("socket_id") ?? "";
  const channel = form.get("channel_name") ?? "";
  if (!/^\d+\.\d+$/.test(socketId)) return json({ error: "Bad socket id." }, 400);

  const business = /^private-business-([0-9a-f-]{36})$/.exec(channel);
  const fleet = /^private-fleet-([0-9a-f-]{36})$/.exec(channel);
  let allowed = false;
  if (business) allowed = actor.role === "business" && actor.id === business[1];
  else if (fleet) {
    allowed =
      actor.role === "rider" &&
      Boolean(await q1("SELECT 1 FROM riders WHERE user_id = $1 AND business_id = $2", [actor.id, fleet[1]]));
  }
  if (!allowed) return json({ error: "Not your channel." }, 403);

  const auth = authorizeChannel(socketId, channel);
  if (!auth) return json({ error: "Real-time updates aren't configured." }, 501);
  return json(auth);
}
