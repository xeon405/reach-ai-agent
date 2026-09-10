// Bundles the REAL supabase/functions/_shared/intelligence-reads.ts into an ESM
// module the Node harness imports. No runtime imports, so no stubs are needed —
// every read function and capPriority runs unmodified from the production source.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outfile = path.join(here, ".stage5", "intelligence-reads.test.mjs");

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