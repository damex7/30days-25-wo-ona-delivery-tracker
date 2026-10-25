// POST /api/rider/trips/:id/photo (multipart, field "photo")
// Uploads the proof-of-delivery photo to Vercel Blob and returns its URL. The
// phone shrinks the photo first (about 1200 px, JPEG), so it's small. Images
// never go in the database: the database stores only the URL.
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { apiError, json, sameOrigin } from "@/lib/api";
import { rateLimit } from "@/lib/auth/rate-limit";
import { currentActor } from "@/lib/auth/session";
import { getRiderTrip, photoProofEnabled } from "@/lib/services/deliveries";
import { mustBe } from "@/lib/services/actor";
import { ConflictError } from "@/lib/services/errors";
import { uuidSchema } from "@/lib/validation";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request, ctx: RouteContext<"/api/rider/trips/[id]/photo">) {
  if (!sameOrigin(req)) return json({ error: "Cross-site request refused." }, 403);
  if (!photoProofEnabled()) return json({ error: "Photo proof isn't set up (no BLOB_READ_WRITE_TOKEN)." }, 501);
  try {
    const me = mustBe(await currentActor(), "rider");
    const id = uuidSchema.parse((await ctx.params).id);
    if (!(await rateLimit(`photo:${me.id}`, 20, 600))) return json({ error: "Too many uploads. Wait a few minutes." }, 429);
    // Only the assigned rider, only while the parcel is out.
    const trip = await getRiderTrip(me, id);
    if (trip.status !== "picked_up" && trip.status !== "arrived") throw new ConflictError("This trip isn't out for delivery.");

    const file = (await req.formData()).get("photo");
    if (!(file instanceof File)) return json({ error: "No photo was sent." }, 400);
    const ext = TYPES[file.type];
    if (!ext) return json({ error: "Use a JPEG, PNG or WebP photo." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "That photo is too large (2 MB at most)." }, 400);

    // A random name inside this delivery's folder: the confirm step checks the folder.
    const blob = await put(`proofs/${id}/${randomBytes(8).toString("hex")}.${ext}`, file, {
      access: "public",
      contentType: file.type,
    });
    return json({ url: blob.url }, 201);
  } catch (e) {
    return apiError(e);
  }
}
