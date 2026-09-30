import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { configure, type Settings } from "./config.js";
import { getPool } from "./db.js";
import { migrate } from "./migrations.js";

/**
 * Run the interschool app inside another Express server (the Rafiki Games one
 * on Render), so no separate service is needed:
 *
 *   const { createInterschool } = await import(".../interschool/server.mjs");
 *   app.use("/interschool", await createInterschool({ databaseUrl, creatorEmail }));
 *
 * It keeps its own database and settings: nothing here reads the host's
 * DATABASE_URL. The web app next to this file was built for the /interschool/
 * path.
 */
export async function createInterschool(settings: Pick<Settings, "databaseUrl" | "creatorEmail"> & Partial<Settings>) {
  if (!settings.databaseUrl) throw new Error("interschool: databaseUrl is required");
  configure(settings);
  await migrate();
  setInterval(() => {
    getPool().query("SELECT 1").catch(() => {});
  }, 10 * 60 * 1000).unref();
  const here = path.dirname(fileURLToPath(import.meta.url));
  return createApp(path.join(here, "web"));
}
