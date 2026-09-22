import fs from "node:fs";
import path from "node:path";
const ROOT = "C:/Dev/reach-ai-agent";
const OLD = "outreach-ochre-sigma.vercel.app";
const SKIP = new Set(["node_modules", ".git", ".vercel", ".output-dist"]);
let hits = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts|js|mjs|json|txt|xml|env|html)$/.test(e.name)) {
      try { if (fs.readFileSync(p, "utf8").includes(OLD)) hits.push(p.slice(ROOT.length)); } catch {}
    }
  }
})(ROOT);
console.log(hits.length ? "OLD HOST STILL IN:\n" + hits.join("\n") : "ALL CLEAN — zero old-host references in repo source");
