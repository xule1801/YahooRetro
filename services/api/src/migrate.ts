import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPool, type Db } from "./db.ts";
import { loadConfig } from "./config.ts";

export async function migrate(db: Db) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  await db.query("CREATE TABLE IF NOT EXISTS app.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query("SELECT name FROM app.schema_migrations")).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query(readFileSync(join(dir, f), "utf8"));
      await c.query("INSERT INTO app.schema_migrations(name) VALUES ($1)", [f]);
      await c.query("COMMIT");
      console.log("applied", f);
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = createPool(loadConfig().databaseUrl);
  await migrate(db);
  await db.end();
}
