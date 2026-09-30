import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Every build gets an id. The app compares its own id with version.json on the
// server and updates itself when a newer build is out (see web/src/lib/update.tsx).
const buildId = Date.now().toString(36);

const versionFile = (): Plugin => ({
  name: "version-file",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: buildId }) });
  },
});

// The service worker, with the list of every file the app needs, so the phone
// can keep all of them and open the app offline (see web/sw-template.js).
const serviceWorker = (): Plugin => ({
  name: "service-worker",
  apply: "build",
  generateBundle(_options, bundle) {
    const built = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "version.json");
    const publicFiles = ["logo.jpg", "hero.jpg", "manifest.webmanifest"];
    const images = ["logos/rafiki.png", "logos/daniels.png", "logos/icc-imara.png", "logos/rosslyn.png",
      "backgrounds/cover.jpg", "backgrounds/rafiki.jpg", "backgrounds/daniels.jpg", "backgrounds/icc-imara.jpg", "backgrounds/rosslyn.jpg"];
    const files = [...new Set(["index.html", ...built, ...publicFiles, ...images])];
    const source = readFileSync(new URL("./web/sw-template.js", import.meta.url), "utf8")
      .replaceAll("__BUILD__", buildId)
      .replaceAll("__FILES__", JSON.stringify(files));
    this.emitFile({ type: "asset", fileName: "sw.js", source });
  },
});

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), versionFile(), serviceWorker()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: { outDir: "../dist/web", emptyOutDir: true },
  // In development the API runs separately on port 3000.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
