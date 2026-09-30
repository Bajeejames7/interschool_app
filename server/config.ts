import { createHash } from "node:crypto";

export interface Settings {
  /** Postgres connection string. */
  databaseUrl: string;
  /**
   * The app creator. Not stored as a role in the database: whoever holds this
   * email is the creator, so it cannot be granted, removed or lost by editing a
   * user. Change it by changing the setting.
   */
  creatorEmail: string;
  /**
   * Signs login tokens. Falls back to a value derived from the database URL
   * (secret and stable per deployment) so a missing setting does not sign
   * everyone out on every restart.
   */
  tokenSecret: string;
  port: number;
  /** The organisation runs on Nairobi time; "today" and session dates use it. */
  timeZone: string;
}

/**
 * Read from the environment. INTERSCHOOL_* names win, so the app can run
 * inside another server (the Rafiki Games one) without picking up that
 * server's DATABASE_URL.
 */
function fromEnv(): Settings {
  const env = process.env;
  const databaseUrl = env.INTERSCHOOL_DATABASE_URL ?? env.DATABASE_URL ?? "";
  return {
    databaseUrl,
    creatorEmail: (env.INTERSCHOOL_CREATOR_EMAIL ?? env.CREATOR_EMAIL ?? "").trim().toLowerCase(),
    tokenSecret: env.INTERSCHOOL_TOKEN_SECRET ?? env.TOKEN_SECRET ?? derivedSecret(databaseUrl),
    port: Number(env.PORT ?? 3000),
    timeZone: "Africa/Nairobi",
  };
}

function derivedSecret(databaseUrl: string): string {
  return createHash("sha256").update(`interschool:${databaseUrl}`).digest("hex");
}

export const config: Settings = fromEnv();

/** Used when the app is mounted inside another server: settings passed in, not read from env. */
export function configure(settings: Partial<Settings>): void {
  Object.assign(config, settings);
  if (settings.databaseUrl && !settings.tokenSecret) config.tokenSecret = derivedSecret(settings.databaseUrl);
  config.creatorEmail = config.creatorEmail.trim().toLowerCase();
}
