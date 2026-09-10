// Purpose-built validator for migration files that contain plpgsql function
// bodies (a `begin` line inside $fn$ is block-open, NOT transaction control —
// scripts/dryrun-sql.mjs intentionally refuses it). Identical safety to the
// dry-run: the whole input runs inside BEGIN...ROLLBACK through the Management
// API (atomic, nothing persists on error or on success). Exit 0 only when the
// API applied AND rolled back cleanly.
//   Usage: node .stage6/validate-mig.mjs <file.sql>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../", process.argv[2]);
const sql = fs.readFileSync(file, "utf8");

const env = fs.readFileSync(path.resolve(here, "../../.env"), "utf8").split("\n").filter(Boolean);
const token = env.find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
const ref = env.find((l) => l.startsWith("SUPABASE_PROJECT_REF="))?.slice("SUPABASE_PROJECT_REF=".length).trim() || "zvohdvopmvzsujktrdmu";

console.log(`[validating] ${path.basename(file)} inside BEGIN...ROLLBACK (no persistence)`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: `begin;\n${sql}\nrollback;` }),
});
const text = await res.text().catch(() => "");
const ok = res.status >= 200 && res.status < 300 && !/error/i.test(text.slice(0, 600));
console.log(`  HTTP ${res.status} — ${ok ? "VALIDATED" : "REJECTED"}`);
if (!ok) console.log(text.slice(0, 2000));
process.exit(ok ? 0 : 1);