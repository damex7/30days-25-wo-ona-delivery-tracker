// Fixed-window rate limiting stored in Postgres, so it works across every
// serverless instance (an in-memory counter would reset on each one).
import { q1 } from "../db";

/** Returns true if this hit is allowed. One atomic statement, so it can't race. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const row = await q1<{ hits: number }>(
    `INSERT INTO rate_limits AS r (key, window_start, hits) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN r.window_start < now() - make_interval(secs => $2) THEN 1 ELSE r.hits + 1 END,
       window_start = CASE WHEN r.window_start < now() - make_interval(secs => $2) THEN now() ELSE r.window_start END
     RETURNING hits`,
    [key, windowSeconds],
  );
  return (row?.hits ?? 0) <= max;
}
