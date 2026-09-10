// Live-applies a migration file through the Management API (atomic single
// query, nothing partial on error). Validates the file first via
// validate-mig.mjs semantics by running it wrapped in BEGIN...ROLLBACK, then
// applies the raw content once. Exit 0 only when both succeed.
//   Usage: node apply-mig.mjs <file.sql>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../", process.argv[2]);
const sql = fs.readFileSync(file, "utf8");

const env = fs.readFileSync(path.resolve(here, "../../.env"), "utf8").split("\n").filter(Boolean);
const token = env.find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
const ref = env.find((l) => l.startsWith("SUPABASE_PROJECT_REF="))?.slice("SUPABASE_PROJECT_REF=".length).trim() || "zvohdvopmvzsujktrdmu";

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

// 1) Dry-run equivalent: validate wrapped in a transaction that is rolled back.
const ok = await run(`begin;\n${sql}\nrollback;`);
console.log(`[validate] HTTP ${ok.status} — ${ok.status >= 200 && ok.status < 300 && !/error/i.test(ok.text.slice(0, 600)) ? "VALIDATED" : "REJECTED"}`);
if (!(ok.status >= 200 && ok.status < 300) || /error/i.test(ok.text.slice(0, 600))) {
  console.log(ok.text.slice(0, 2000));
  process.exit(1);
}

// 2) Live apply.
console.log(`[apply] ${path.basename(file)} …`);
const res = await run(sql);
const applied = res.status >= 200 && res.status < 300 && !/error/i.test(res.text.slice(0, 600));
console.log(`[apply] HTTP ${res.status} — ${applied ? "APPLIED" : "FAILED"}`);
if (!applied) console.log(res.text.slice(0, 2000));
process.exit(applied ? 0 : 1);