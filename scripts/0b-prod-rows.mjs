// 0b LIVE PROOF — resolves effective agent_config against REAL production rows
// through the actual resolver module (the same one inbox-agent v43 imports).
// Usage: node scripts/0b-prod-rows.mjs [userId] [campaignId]
import { resolveAgentConfig } from "../supabase/functions/_shared/agent-config.ts";
import fs from "node:fs";

let token;
try { token = fs.readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))?.slice("SUPABASE_ACCESS_TOKEN=".length).trim(); } catch {}
const ref = "zvohdvopmvzsujktrdmu";
const userId = process.argv[2] ?? "00000000-0000-0000-0000-000000000000";
const campaignId = process.argv[3] ?? null;

// Same columns + filter resolveAgentConfig uses (enabled=true, keys in list).
const sql = `select key, scope, scope_id, value from public.agent_config
  where enabled = true and key in ('confidence_floor','turn_budget','reply_policy','max_ai_replies_per_lead_24h');`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const rows = await res.json();

// Shape rows exactly as the resolver expects (supabase-js returns these fields).
const db = {
  from() {
    return {
      select() {
        return {
          eq: () => ({
            in: () => Promise.resolve({ data: rows, error: null }),
          }),
        };
      },
    };
  },
};

const cfg = await resolveAgentConfig(db, { userId, campaignId });
console.log(JSON.stringify({ scope: { userId, campaignId }, rows: rows.length, effective: cfg }, null, 2));