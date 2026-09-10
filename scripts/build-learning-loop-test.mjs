// Bundles the REAL learning-loop index.ts into an ESM module the Node harness
// can import, replacing only the four environment imports (deno std, supabase-js,
// _shared/audit, _shared/osm) with the local stubs. All fold logic — scoring,
// campaign folds, strategy folds, countryStatus, isoWeekStart, gates — runs
// unmodified from the production source.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stubs = path.join(here, ".stage4", "stubs");
const outfile = path.join(here, ".stage4", "learning-loop.test.mjs");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, "supabase/functions/learning-loop/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  absWorkingDir: root,
  logLevel: "silent",
  plugins: [{
    name: "stage4-stubs",
    setup(b) {
      const stubsBySpec = new Map([
        ["https://deno.land/std@0.168.0/http/server.ts", path.join(stubs, "serve.ts")],
        ["https://esm.sh/@supabase/supabase-js@2", path.join(stubs, "supabase-js.ts")],
      ]);
      b.onResolve({ filter: /^https:\/\// }, (args) => {
        const s = stubsBySpec.get(args.path);
        return s ? { path: s } : { errors: [{ text: `unhandled https import: ${args.path}` }] };
      });
      b.onResolve({ filter: /_shared\/audit\.ts$/ }, () => ({ path: path.join(stubs, "audit.ts") }));
      b.onResolve({ filter: /_shared\/osm\.ts$/ }, () => ({ path: path.join(stubs, "osm.ts") }));
    },
  }],
});
console.log(`built ${path.relative(process.cwd(), outfile)}`);