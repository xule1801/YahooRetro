import pg from "pg";
export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export const createPool = (url: string) => new pg.Pool({ connectionString: url, max: 10 });
export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}
export const isUniqueViolation = (e: unknown, constraint?: string) =>
  (e as { code?: string })?.code === "23505" && (!constraint || (e as { constraint?: string }).constraint === constraint);
