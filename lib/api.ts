// Helpers for JSON route handlers.
import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, RuleError } from "./services/errors";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Errors → HTTP status codes. Unknown errors are logged and hidden. */
export function apiError(e: unknown) {
  if (e instanceof z.ZodError) return json({ error: z.flattenError(e).formErrors[0] ?? Object.values(z.flattenError(e).fieldErrors).flat()[0] ?? "Invalid request." }, 400);
  if (e instanceof NotFoundError) return json({ error: e.message }, 404);
  if (e instanceof ForbiddenError) return json({ error: e.message }, 403);
  if (e instanceof ConflictError) return json({ error: e.message }, 409);
  if (e instanceof RuleError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

/**
 * Browsers always send an Origin header on POST. If it isn't our own site, the
 * request came from another website using the visitor's cookie (CSRF), so refuse.
 * The SameSite=Lax cookie already blocks this; this is a second lock on the door.
 */
export function sameOrigin(req: Request): boolean {
  // Modern browsers label every request with Sec-Fetch-Site. "same-origin"
  // means the page that sent it is on our own site.
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Older browsers: compare the Origin header with the host we're serving.
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin).host;
    return o === new URL(req.url).host || o === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}
