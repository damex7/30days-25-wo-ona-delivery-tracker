// Session rows, without any Next.js imports, so scripts can use them too.
import { q, q1 } from "../db";
import type { Actor, Role } from "../services/actor";
import { hashToken, newToken } from "./tokens";

export const SESSION_DAYS = 30;

export async function createSessionRow(userId: string): Promise<{ token: string; expires: Date }> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token), userId, expires,
  ]);
  return { token, expires };
}

/** The user behind a session cookie, or null if it's unknown, expired or suspended. */
export async function actorFromToken(token: string): Promise<Actor | null> {
  const row = await q1<{ id: string; name: string; email: string; role: Role; is_demo: boolean }>(
    `SELECT u.id, u.name, u.email, u.role, u.is_demo
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.suspended_at IS NULL`,
    [hashToken(token)],
  );
  return row ? { id: row.id, name: row.name, email: row.email, role: row.role, isDemo: row.is_demo } : null;
}

export async function deleteSessionRow(token: string) {
  await q("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}
