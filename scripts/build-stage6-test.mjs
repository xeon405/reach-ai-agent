// Stage 6 harness bundler. Bundles the REAL
// supabase/functions/_shared/intelligence-reads.ts into ESM the Node harness
// imports unmodified (same approach as scripts/build-stage5-test.mjs).
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outfile = path.join(here, ".stage6", "intelligence-reads.test.mjs");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, "supabase/functions/_shared/intelligence-reads.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  absWorkingDir: root,
  logLevel: "silent",
});
console.log(`built ${path.relative(process.cwd(), outfile)}`);