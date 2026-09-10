// Supabase Management API SQL runner — executes a SQL file against the project.
// Usage: node supabase-sql.mjs <file.sql> [--print]
// WARNING: THIS APPLIES. For validation use scripts/dryrun-sql.mjs (cannot persist).
const fs = await import("node:fs");
const [,, file, flag] = process.argv;
function readEnv(name) {
  try {
    const text = fs.readFileSync(".env", "utf8");
    const match = text.split("\n").find((l) => l.startsWith(`${name}=`));
    return match ? match.slice(name.length + 1).trim() : undefined;
  } catch { return undefined; }
}
const token = readEnv("SUPABASE_ACCESS_TOKEN");
if (!token) { console.error("no SUPABASE_ACCESS_TOKEN in .env"); process.exit(1); }
const ref = readEnv("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
const sql = fs.readFileSync(file, "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
const ok = res.status >= 200 && res.status < 300;
if (flag === "--print" || !ok) {
  console.log(`HTTP ${res.status}:`, text.slice(0, 4000));
}
process.exit(ok ? 0 : 1);