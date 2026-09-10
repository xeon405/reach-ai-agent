// Shared helper: run SQL against the live Supabase project via the Management
// API query endpoint, and look up .env values. Used by the stage-9 proof
// harnesses (apply/verify migration, live break/cooldown/resolve cycle).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const REF = env.SUPABASE_PROJECT_REF ?? "zvohdvopmvzsujktrdmu";

export function getEnv(key) {
  return env[key];
}

export async function runQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`runQuery failed (${res.status}): ${text.slice(0, 1500)}`);
  }
  return res.json();
}

export async function applyMigration(relPath) {
  const sql = readFileSync(new URL(`../../${relPath}`, import.meta.url), "utf8");
  return runQuery(sql);
}