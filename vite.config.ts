import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  // In development the API runs separately on port 3000.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
