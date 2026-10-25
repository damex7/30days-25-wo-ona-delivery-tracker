// npm run db:migrate
// Applies every db/migrations/NNN_name.sql file that hasn't run yet, in order,
// each inside its own transaction, and records it in schema_migrations.
// Running it twice is safe: the second run applies nothing.
import "./env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool, q, tx } from "../lib/db";

async function main() {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set(
    (await q<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name),
  );
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    await tx(async (db) => {
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    console.log(`applied ${file}`);
    applied++;
  }
  console.log(applied ? `${applied} migration(s) applied.` : "Nothing to apply. Database is up to date.");
  await pool().end();
}

main().catch(async (err) => {
  console.error(err);
  await pool().end().catch(() => {});
  process.exit(1);
});
