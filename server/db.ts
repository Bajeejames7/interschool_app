import pg from "pg";
import { config } from "./config.js";

// Return DATE columns as plain "YYYY-MM-DD" strings, not JS Dates shifted by
// the server's time zone.
pg.types.setTypeParser(1082, (value) => value);

let shared: pg.Pool | null = null;

/** The connection pool, opened on first use. */
export function getPool(): pg.Pool {
  if (shared) return shared;
  if (!config.databaseUrl) throw new Error("DATABASE_URL must be set (see .env.example)");
  const url = new URL(config.databaseUrl);
  // TLS is configured below; drop sslmode so pg does not also try to verify
  // the certificate chain itself.
  url.searchParams.delete("sslmode");
  // Hosted Postgres (Neon, Aiven, Render) needs TLS; a local database does not.
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  shared = new pg.Pool({
    connectionString: url.toString(),
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  return shared;
}

export async function closePool(): Promise<void> {
  await shared?.end();
  shared = null;
}

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = getPool(),
): Promise<T[]> {
  const result = await client.query<T>(sql, params);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = getPool(),
): Promise<T | undefined> {
  return (await query<T>(sql, params, client))[0];
}

/** Runs fn inside a transaction; rolls back if it throws. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
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
