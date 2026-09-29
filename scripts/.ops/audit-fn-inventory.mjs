// Authoritative inventory: what is ACTUALLY deployed, and with what gateway auth.
// Local config.toml only lists 4 functions; the rest inherit a default that may
// differ from what is live in production.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const REF = env.SUPABASE_PROJECT_REF;
const T = env.SUPABASE_ACCESS_TOKEN;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions`, {
  headers: { Authorization: `Bearer ${T}` },
});
const fns = await r.json();
if (!Array.isArray(fns)) { console.log(JSON.stringify(fns).slice(0, 500)); process.exit(1); }

console.log("deployed function count:", fns.length);
console.log();
const rows = fns
  .map((f) => ({
    name: f.slug,
    jwt: f.verify_jwt === false ? "FALSE (public)" : "true (gateway)",
    version: f.version,
  }))
  .sort((a, b) => a.jwt.localeCompare(b.jwt) || a.name.localeCompare(b.name));

let pub = 0;
for (const x of rows) {
  if (x.jwt.startsWith("FALSE")) pub++;
  console.log(`${x.jwt.padEnd(15)} ${x.name}`);
}
console.log();
console.log("PUBLIC (gateway does NOT check a JWT):", pub, "of", rows.length);
console.log("Names:", rows.filter((x) => x.jwt.startsWith("FALSE")).map((x) => x.name).join(", "));
