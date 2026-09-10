import fs from "node:fs";
import path from "node:path";
const env = fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", ".env"), "utf8").split("\n").filter(Boolean);
const get = (k) => env.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();
const TOKEN = get("SUPABASE_ACCESS_TOKEN"); const REF = get("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
async function exec(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }) });
  const t = await res.text().catch(() => ""); if (!/^2\d\d$/.test(String(res.status))) throw new Error(`SQL ${res.status}: ${t.slice(0, 400)}`);
  try { return JSON.parse(t); } catch { return t; }
}
console.log("[cron]", JSON.stringify(await exec("select jobname, schedule, active from cron.job where jobname='cost-sweep'")));
console.log("[profile]", JSON.stringify((await exec(`select plan, gmail_connected, emails_sent_date, emails_sent_today, gmail_account_type from public.profiles where id='39b65a0f-2c1d-48e2-9ee7-a358ba8d0570'`))[0]));
console.log("[state-row]", JSON.stringify(await exec("select count(*) as n from public.ai_cost_state")));
console.log("[ledger-today]", JSON.stringify(await exec("select count(*) as n from public.ai_spend_ledger where ts >= current_date")));
console.log("[markers]", JSON.stringify(await exec("select key,scope,scope_id,value from public.agent_config where key like 'ai_quality.%' limit 20")));