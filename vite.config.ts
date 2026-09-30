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

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: { outDir: "../dist/web", emptyOutDir: true },
  // In development the API runs separately on port 3000.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
