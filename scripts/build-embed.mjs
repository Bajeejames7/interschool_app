// Builds the app to run inside another server at /interschool/ (see server/embed.ts).
//
//   node scripts/build-embed.mjs [target folder]
//
// Output: server.mjs (the API with its dependencies bundled in, no install
// needed) and web/ (the app, built for the /interschool/ path). With a target
// folder, the result is copied there too — e.g. into the Rafiki Games repo.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = path.resolve("dist-embed");
rmSync(out, { recursive: true, force: true });

execSync(`npx vite build --base /interschool/ --outDir "${path.join(out, "web")}" --emptyOutDir`, { stdio: "inherit" });

await build({
  entryPoints: ["server/embed.ts"],
  outfile: path.join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["pg-native"],
  // Bundled CommonJS packages (express) still call require() for Node built-ins.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});

writeFileSync(
  path.join(out, "README.md"),
  "Built from github.com/Bajeejames7/interschool_app by `node scripts/build-embed.mjs`. Do not edit by hand: change the interschool repo and rebuild.\n",
);

const target = process.argv[2];
if (target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(out, target, { recursive: true });
  console.log(`Copied to ${target}`);
}
