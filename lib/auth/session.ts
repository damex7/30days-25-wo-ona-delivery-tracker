// Reading and writing the session cookie. Only Server Components, Server
// Actions and route handlers import this file.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor, Role } from "../services/actor";
import { actorFromToken, createSessionRow, deleteSessionRow } from "./sessions";

const COOKIE = "woona_session";

export async function startSession(userId: string) {
  const { token, expires } = await createSessionRow(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // JavaScript in the page can't read it, so XSS can't steal it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // not sent on cross-site POSTs, which blocks CSRF
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSessionRow(token);
  jar.delete(COOKIE);
}

/** The logged-in user for this request, or null. cache() runs it once per request. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return actorFromToken(token);
});

/** Like currentActor, but sends visitors to /login and wrong roles to their dashboard. */
export async function requireActor(...roles: Role[]): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (roles.length && !roles.includes(actor.role)) redirect(homeFor(actor.role));
  return actor;
}

export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "business" ? "/business" : "/rider";
}

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
