// Live auth audit — five clean functions. For each: (a) no auth, (b) malformed
// token, (c) wrong real credential (anon key). Then verify zero side effects:
// no send_queue/emails_sent/audit/ai_spend_ledger writes, no LLM charge, no
// data leak in the response body. All against REAL campaign/email ids so a leak
// or a write would be visible.
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV = {};
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2];
}
const SUPABASE_URL = ENV.SUPABASE_URL ?? `https://${ENV.SUPABASE_PROJECT_REF}.supabase.co`;
let ANON = ENV.SUPABASE_ANON_KEY;
if (!ANON) {
  const ref = ENV.SUPABASE_PROJECT_REF ?? "zvohdvopmvzsujktrdmu";
  const token = ENV.SUPABASE_ACCESS_TOKEN;
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const keys = await resp.json();
  ANON = (keys.find((k) => k.name === "anon") ?? keys[0]).api_key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const campaign = (await db.runQuery(`select id from campaigns where status='active' limit 1;`))[0];
const emailRow = (await db.runQuery(`select id, gmail_message_id from emails_sent where gmail_message_id is not null and ai_draft is not null limit 1;`))[0];
if (!campaign || !emailRow || !ANON) throw new Error("missing baseline (campaign/email row/anon key)");

const base = (await db.runQuery(`
  select (select count(*) from send_queue) sq,
         (select count(*) from emails_sent) es,
         (select count(*) from audit_events) au,
         (select count(*) from ai_spend_ledger) lg,
         (select count(*) from owner_alerts) oa,
         (select count(*) from support_chat_messages) scm;`))[0];

const cases = [
  { fn: "send-campaign", body: { campaignId: campaign.id } },
  { fn: "send-reply", body: { emailId: emailRow.id } },
  { fn: "find-leads", body: { jobTitle: "dentist", country: "United States" } },
  { fn: "generate-email", body: { leadName: "A", leadCompany: "B", leadJobTitle: "C" } },
];

async function post(fn, headers, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: (await res.text()).slice(0, 200) };
  } catch (e) {
    return { status: "ERR", text: e.message.slice(0, 120) };
  }
}

const results = [];
for (const c of cases) {
  const noAuth = await post(c.fn, {}, c.body);
  const malformed = await post(c.fn, { Authorization: "Bearer invalid.token.here" }, c.body);
  const wrongCred = await post(c.fn, { Authorization: `Bearer ${ANON}` }, c.body);
  results.push({ fn: c.fn, noAuth, malformed, wrongCred });
}

// tools: intended-public. Malformed token must be ignored; a no-auth valid call works.
const t1 = await post("tools", {}, { action: "validate", emails: ["test@outreachai.test"] });
const t2 = await post("tools", { Authorization: "Bearer invalid.token.here" }, { action: "validate", emails: ["noone@nowhere.invalid"] });

await sleep(6000); // let fire-and-forget meter flush settle

const after = (await db.runQuery(`
  select (select count(*) from send_queue) sq,
         (select count(*) from emails_sent) es,
         (select count(*) from audit_events) au,
         (select count(*) from ai_spend_ledger) lg,
         (select count(*) from owner_alerts) oa,
         (select count(*) from support_chat_messages) scm;`))[0];

for (const r of results) console.log(JSON.stringify(r));
console.log("tools no-auth:", JSON.stringify(t1));
console.log("tools with malformed token:", JSON.stringify(t2));
console.log("baseline:", JSON.stringify(base));
console.log("after:   ", JSON.stringify(after));
const deltas = Object.fromEntries(Object.keys(base).map((k) => [k, after[k] - base[k]]));
console.log("deltas:", JSON.stringify(deltas));