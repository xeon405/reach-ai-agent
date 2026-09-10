// Read-only discovery runner for the Stage 6 live proof: runs each query
// through the Management API and prints ALL rows (unlike supabase-sql.mjs,
// which prints only the last statement).
//   Usage: node scripts/.stage6/q.mjs "<SQL>" ["<SQL2>" ...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").filter(Boolean);
const token = env.find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
const ref = env.find((l) => l.startsWith("SUPABASE_PROJECT_REF="))?.slice("SUPABASE_PROJECT_REF=".length).trim() || "zvohdvopmvzsujktrdmu";

const queries = process.argv.slice(2);
for (const q of queries) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text().catch(() => "");
  console.log(`\n>>> ${q.slice(0, 90)}${q.length > 90 ? "…" : ""}`);
  if (!/^2\d\d/.test(String(res.status))) { console.log(`    HTTP ${res.status}: ${text.slice(0, 400)}`); continue; }
  try {
    const rows = JSON.parse(text);
    console.table(Array.isArray(rows) ? rows : [rows]);
  } catch { console.log(text.slice(0, 800)); }
}
process.exit(0);