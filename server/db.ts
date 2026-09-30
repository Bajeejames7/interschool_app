import pg from "pg";
import { config } from "./config.js";

// Hosted Postgres (Neon, Aiven, Render) needs TLS; a local database does not.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl.replace(/[?&]sslmode=[^&]*/g, ""),
  ssl: local ? undefined : { rejectUnauthorized: false },
  max: 10,
});

// Return DATE columns as plain "YYYY-MM-DD" strings, not JS Dates shifted by
// the server's time zone.
pg.types.setTypeParser(1082, (value) => value);

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<T | undefined> {
  return (await query<T>(sql, params, client))[0];
}

/** Runs fn inside a transaction; rolls back if it throws. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
