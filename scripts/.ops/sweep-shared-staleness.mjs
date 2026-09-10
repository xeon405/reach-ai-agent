import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, normalize, resolve } from "node:path";
import { getEnv } from "./_db.mjs";

const FUNCS = resolve(getEnv("BASE") ?? process.cwd(), "supabase/functions");
const SHARED = join(FUNCS, "_shared");

const IMPORT_RE = /(?:from\s*|import\s*)\s*["'](\.[^"']+)["']/g;

function collectShared(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    let src;
    try { src = readFileSync(file, "utf8").replace(/\/\/.*$/gm, ""); } catch { continue; }
    for (const m of src.matchAll(IMPORT_RE)) {
      const full = normalize(join(dirname(file), m[1]));
      if (full.startsWith(SHARED)) seen.add(full);
      if (full.startsWith(FUNCS)) queue.push(full);
    }
  }
  return [...seen].filter((f) => f.startsWith(SHARED));
}

const fns = await fetch(
  `https://api.supabase.com/v1/projects/${getEnv("SUPABASE_PROJECT_REF")}/functions`,
  { headers: { Authorization: `Bearer ${getEnv("SUPABASE_ACCESS_TOKEN")}` } },
).then((r) => r.json());

const rows = fns
  .sort((a, b) => a.updated_at - b.updated_at)
  .map((f) => {
    const dir = join(FUNCS, f.slug);
    const entry = join(dir, "index.ts");
    if (!existsSync(entry)) return { slug: f.slug, deployed: f.updated_at, deps: [], version: f.version, stale: null };
    const deps = collectShared(entry);
    const changes = deps.map((d) => {
      const m = statSync(d).mtimeMs;
      return { file: d.replace(SHARED + "\\", "").replace(SHARED + "/", ""), changedAt: m };
    }).sort((a, b) => b.changedAt - a.changedAt);
    const stale = changes.filter((c) => c.changedAt > f.updated_at);
    return {
      slug: f.slug, deployed: f.updated_at, version: f.version,
      deps: changes, stale,
      verifyJwt: f.verify_jwt,
    };
  });

let staleCount = 0;
for (const r of rows) {
  const depl = new Date(r.deployed).toISOString().slice(0, 16);
  if (!r.deps?.length) { console.log(`SKIP  ${r.slug.padEnd(18)} v${r.version}  no _shared imports  (deployed ${depl})`); continue; }
  const depTxt = r.deps.map((d) => `${d.file}@${new Date(d.changedAt).toISOString().slice(0, 16)}`).join(", ");
  if (r.stale?.length) {
    staleCount++;
    const off = r.stale.map((s) => `${s.file} (wrote ${new Date(s.changedAt).toISOString().slice(0,16)}, deployed ${depl})`).join("; ");
    console.log(`STALE ${r.slug.padEnd(18)} v${r.version}  last dup ${depl}  -> ${off}`);
  } else {
    console.log(`ok    ${r.slug.padEnd(18)} v${r.version}  last dup ${depl}  deps: ${depTxt}`);
  }
}
console.log(`\n${staleCount} function(s) running a stale shared-module bundle.`);
process.exit(staleCount ? 1 : 0);