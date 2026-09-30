import { createHash } from "node:crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (see .env.example)`);
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 3000),
  /**
   * The app creator. Not stored as a role in the database: whoever holds this
   * email is the creator, so it cannot be granted, removed or lost by editing a
   * user. Change it by changing the environment variable.
   */
  creatorEmail: (process.env.CREATOR_EMAIL ?? "").trim().toLowerCase(),
  /**
   * Signs login tokens. Falls back to a value derived from DATABASE_URL (secret
   * and stable per deployment) so a missing variable does not sign everyone
   * out on every restart.
   */
  tokenSecret:
    process.env.TOKEN_SECRET ??
    createHash("sha256").update(`interschool:${process.env.DATABASE_URL ?? ""}`).digest("hex"),
  /** The organisation runs on Nairobi time; "today" and session dates use it. */
  timeZone: "Africa/Nairobi",
};
