import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Dev/reach-ai-agent";
const OLD = "outreach-ochre-sigma.vercel.app";
const SKIP = new Set(["node_modules", ".git", ".vercel", "dist-supabase", "dist\\supabase", "supabase-build"]);

const hits = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else {
      try {
        if (fs.readFileSync(p, "utf8").includes(OLD)) hits.push(p.slice(ROOT.length));
      } catch {}
    }
  }
})(path.join(ROOT, "dist"));

console.log(hits.length
  ? "OLD host still in dist (" + hits.length + "):\n" + hits.join("\n")
  : "dist CLEAN — zero outreach-ochre-sigma references anywhere in the bundle");
