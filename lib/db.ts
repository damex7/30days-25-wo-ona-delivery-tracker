// Database access: one connection pool and three small helpers.
//
// On Vercel we talk to Neon with @neondatabase/serverless, whose Pool speaks the
// same API as node-postgres but over WebSockets (fast to open from a serverless
// function). For a local Postgres (DATABASE_URL pointing at localhost) we use
// node-postgres directly. Everything else in the app only sees q(), q1() and tx().
import { Pool as NeonPool, types as neonTypes } from "@neondatabase/serverless";
import pg from "pg";

// Postgres returns bigint (int8) as a string because it can exceed JavaScript's
// safe integer range. Our bigints are kobo amounts and counts, far below
// 2^53 (about ₦90 trillion), so converting them to numbers is safe and simpler.
const INT8 = 20;
pg.types.setTypeParser(INT8, (v: string) => Number(v));
neonTypes.setTypeParser(INT8, (v: string) => Number(v));

export type Row = Record<string, unknown>;

/** The part of a pg client that our helpers use. */
export interface Queryable {
  query<R extends Row = Row>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

interface PoolLike extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
  end(): Promise<void>;
}

function makePool(): PoolLike {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return (isLocal
    ? new pg.Pool({ connectionString: url, max: 10 })
    : new NeonPool({ connectionString: url, max: 10 })) as unknown as PoolLike;
}

// Reuse one pool across hot reloads in development and across requests that
// land on the same warm serverless instance.
const g = globalThis as unknown as { __woOnaPool?: PoolLike };
export function pool(): PoolLike {
  if (!g.__woOnaPool) g.__woOnaPool = makePool();
  return g.__woOnaPool;
}

/** Run a parameterised query and return all rows. Never build SQL from user input. */
export async function q<R extends Row = Row>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool(),
): Promise<R[]> {
  const res = await db.query<R>(text, params);
  return res.rows;
}

/** Run a query that returns at most one row. */
export async function q1<R extends Row = Row>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool(),
): Promise<R | null> {
  const rows = await q<R>(text, params, db);
  return rows[0] ?? null;
}

/**
 * Run fn inside a transaction on one dedicated connection. Every query inside
 * either all happen or none do. Errors roll back and are re-thrown.
 */
export async function tx<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error code, if err came from the database. */
export function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}
