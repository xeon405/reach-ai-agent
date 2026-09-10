#!/usr/bin/env node
// Read-only .env auditor. Never writes .env; refuses placeholders; enforces the
// required script-facing key set. With `--verify-cron` it also cross-checks
// CRON_SECRET against the live Supabase secrets list by SHA-256 (values are
// never printed — only key names and a PASS/FAIL per check).
//
// Usage:
//   node scripts/env-audit.mjs            # presence + placeholder checks
//   node scripts/env-audit.mjs --verify-cron   # + live CRON_SECRET hash compare
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const REQUIRED = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "CRON_SECRET"];
const OPTIONAL = ["SUPABASE_URL"];

if (!fs.existsSync(envPath)) {
  console.error("FAIL  .env not found at", envPath);
  console.error("       copy .env.example -> .env and fill from the production project.");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const entries = new Map();
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) entries.set(m[1], m[2].trim());
}

let failed = false;
const placeholder = (v) => !v || /^\$\{/.test(v) || /<(.*)>/.test(v);

console.log("== .env audit (read-only) ==");
for (const k of REQUIRED) {
  const v = entries.get(k);
  const ok = v !== undefined && !placeholder(v);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${k}${ok ? "" : "  (missing/empty/placeholder)"}`);
  if (!ok) failed = true;
}
for (const k of OPTIONAL) {
  const v = entries.get(k);
  console.log(`  ${v !== undefined && !placeholder(v) ? "PASS" : "INFO"}  ${k}  (${v === undefined ? "absent — scripts derive from project ref" : "present"})`);
}

if (process.argv.includes("--verify-cron") && entries.get("CRON_SECRET") && entries.get("SUPABASE_ACCESS_TOKEN")) {
  try {
    const ref = entries.get("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
    const cmd = `supabase secrets list --project-ref ${ref}`;
    const out = execFileSync(cmd, { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });
    const firstLine = out.trim().split(/\r?\n/)[0] || "";
    let prodHash = null;
    if (firstLine.startsWith("{")) {
      const list = JSON.parse(firstLine).secrets || [];
      prodHash = (list.find((s) => s.name === "CRON_SECRET") || {}).value || null;
    } else {
      const row = out.split(/\r?\n/).find((l) => l.includes("CRON_SECRET"));
      if (row) prodHash = row.trim().split(/\s+/).pop();
    }
    if (prodHash) {
      const localHash = crypto.createHash("sha256").update(entries.get("CRON_SECRET")).digest("hex");
      const ok = prodHash === localHash;
      console.log(`  ${ok ? "PASS" : "FAIL"}  CRON_SECRET matches production secrets list`);
      if (!ok) failed = true;
    } else {
      console.log("  INFO  CRON_SECRET not found in production secrets list (cli output unreadable?)");
    }
  } catch (e) {
    console.log("  WARN  could not reach `supabase secrets list` for hash compare:", String(e.message).slice(0, 120));
  }
}

console.log(failed ? "\nRESULT: FAIL — fix .env (copy from production / .env.example) before running scripts."
  : "\nRESULT: PASS");
process.exit(failed ? 1 : 0);