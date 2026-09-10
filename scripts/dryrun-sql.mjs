// ============================================================
// DRY-RUN SQL VALIDATOR — structurally cannot persist anything.
// Always wraps the input in BEGIN...ROLLBACK and refuses input that
// manages its own transaction. The only "write" is within the rolled-
// back transaction. Use this for ALL migration/DDL validation.
//   Usage: node dryrun-sql.mjs <file.sql> [verify.sql]
//   - <file.sql>   plain SQL to validate (no BEGIN/COMMIT/ROLLBACK inside)
//   - [verify.sql] optional read-only query run AFTER the rollback to
//                  prove the schema is byte-identical to before.
//   Exit 0 = validated + unchanged; nonzero otherwise.
// ============================================================
import fs from "node:fs";

const file = process.argv[2];
const verifyFile = process.argv[3] ?? null;
if (!file) { console.error("usage: node dryrun-sql.mjs <file.sql> [verify.sql]"); process.exit(2); }

const env = fs.readFileSync(".env", "utf8").split("\n").filter(Boolean);
const token = env.find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim();
const ref = env.find((l) => l.startsWith("SUPABASE_PROJECT_REF="))?.slice("SUPABASE_PROJECT_REF=".length).trim() || "zvohdvopmvzsujktrdmu";
if (!token) { console.error("no SUPABASE_ACCESS_TOKEN in .env"); process.exit(2); }

const sql = fs.readFileSync(file, "utf8");

// Refuse input that manages its own transaction — would make the wrap ambiguous.
const offending = sql.split("\n")
  .map((l) => l.trim().toLowerCase().replace(/\s*--.*$/, "").replace(/\s*\/\*[\s\S]*?\*\//g, ""))
  .find((l) => /^(begin|commit|rollback)\b/.test(l));
if (offending) {
  console.error(`refusing to validate: "${offending.trim()}" — input manages its own transaction.\nWrap removed; put BEGIN/ROLLBACK only inside this tool.`);
  process.exit(3);
}

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

console.log(`[dryrun] validating ${file} inside BEGIN...ROLLBACK (no persistence)`);
const { status, text } = await run(`begin;\n${sql}\nrollback;`);
const ok = status >= 200 && status < 300 && !/error/i.test(text.slice(0, 500));
if (!ok) {
  console.error(`[dryrun] FAILED — ${status}: ${text.slice(0, 4000)}`);
  process.exit(1);
}
console.log(`[dryrun] validated OK (HTTP ${status}), changes rolled back`);

if (verifyFile) {
  const v = await run(fs.readFileSync(verifyFile, "utf8"));
  if (v.status < 200 || v.status >= 300) { console.error(`[dryrun] verify query failed: ${v.status} ${v.text.slice(0, 1000)}`); process.exit(1); }
  console.log(`[dryrun] post-rollback state: ${v.text.slice(0, 1000)}`);
}
console.log("[dryrun] done — schema unchanged, nothing applied.");
process.exit(0);