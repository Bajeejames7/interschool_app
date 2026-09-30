import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrate } from "./migrations.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Built: dist/server/index.js next to dist/web. In dev (tsx) Vite serves the web app.
const webDir = path.resolve(here, "../web");

await migrate();
createApp(webDir).listen(config.port, () => {
  console.log(`Interschool app listening on port ${config.port}`);
  if (!config.creatorEmail) console.warn("CREATOR_EMAIL is not set: nobody can open Creator Control yet.");
});

// Free hosting puts idle servers and databases to sleep. While the server is
// awake, keep the database connection warm so the first tap is not slow.
setInterval(() => {
  pool.query("SELECT 1").catch(() => {});
}, 10 * 60 * 1000).unref();
