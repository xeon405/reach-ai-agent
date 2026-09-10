// Stage 7 harness bundler. Bundles the REAL
// supabase/functions/_shared/ai-cost-gate.ts into ESM the Node harness imports
// (same approach as scripts/.stage6/build-stage6-test.mjs).
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outfile = path.join(here, "ai-cost-gate.test.mjs");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, "supabase/functions/_shared/ai-cost-gate.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  absWorkingDir: root,
  logLevel: "silent",
});
console.log(`built ${path.relative(process.cwd(), outfile)}`);