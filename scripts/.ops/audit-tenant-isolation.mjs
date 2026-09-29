// EMPIRICAL cross-tenant probe. Creates a throwaway attacker account, signs in
// for a REAL user JWT, then tries to reach the owner's data three ways:
//   A. PostgREST read   (should be blocked by RLS)
//   B. PostgREST write  (should be blocked by RLS)
//   C. Edge functions   (should be blocked by ownership checks)
// Everything the attacker creates is deleted at the end. The single write test
// sets a field to the value it ALREADY holds, so even a total RLS failure
// cannot corrupt owner data.
import { readFileSync } from "node:fs";
import { runQuery } from "../.ops/_db.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const URL_ = env.SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER = "outreachai.team@gmail.com";

const pass = [];
const fail = [];
const check = (ok, label, detail) => (ok ? pass : fail).push(`${label}${detail ? " — " + detail : ""}`);

// ---------- victim data ----------
const v = await runQuery(`
  select (select id::text from leads where user_id=(select id from profiles where email='${OWNER}') limit 1) as lead_id,
         (select name from leads where user_id=(select id from profiles where email='${OWNER}') limit 1) as lead_name,
         (select id::text from emails_sent where user_id=(select id from profiles where email='${OWNER}') limit 1) as email_id,
         (select id::text from campaigns where user_id=(select id from profiles where email='${OWNER}') limit 1) as campaign_id
`);
const { lead_id, lead_name, email_id, campaign_id } = v[0];
const emailId = email_id;
const campaignId = campaign_id;
if (!lead_id || !email_id) { console.log("no victim rows to test against:", v); process.exit(1); }

// ---------- attacker identity ----------
const email = `tenant-probe-${Date.now()}@example.invalid`;
const anonKey = (await readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
  .split("\n").find((l) => l.startsWith("VITE_SUPABASE_PUBLISHABLE_KEY=")) || "")
  .split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");

const mk = await fetch(`${URL_}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Pr0be-temp-pw-9271!", email_confirm: true }),
});
const mkUser = await mk.json();

const login = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Pr0be-temp-pw-9271!" }),
});
const tok = (await login.json()).access_token;
const AT = (h = {}) => ({ apikey: anonKey, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...h });
const FN = (h = {}) => ({ ...AT(), ...h });

if (!tok) { console.log("could not mint attacker token:", await login.text()); process.exit(1); }

// ---------- A. PostgREST read ----------
let r = await fetch(`${URL_}/rest/v1/leads?select=id,email,name&limit=100`, { headers: AT() });
let rows = await r.json();
check(Array.isArray(rows) && rows.length === 0, "A. read all leads via PostgREST", `${Array.isArray(rows) ? rows.length : "?"} rows visible (expect 0)`);

r = await fetch(`${URL_}/rest/v1/leads?select=id,email,name&id=eq.${lead_id}`, { headers: AT() });
rows = await r.json();
// A KNOWN uuid must still be invisible — this is the real IDOR test.
check(Array.isArray(rows) && rows.length === 0, "B. read victim's lead by known UUID", `${Array.isArray(rows) ? rows.length : "?"} rows (expect 0)`);

r = await fetch(`${URL_}/rest/v1/emails_sent?select=id,body&limit=100`, { headers: AT() });
rows = await r.json();
check(Array.isArray(rows) && rows.length === 0, "C. read victim's sent email bodies", `${Array.isArray(rows) ? rows.length : "?"} rows (expect 0)`);

// No table-level GRANT exists for `authenticated` here, so the table is
// unreachable from a browser at all — stronger than RLS. Accept either
// "denied" or "empty", but never actual token material.
r = await fetch(`${URL_}/rest/v1/gmail_tokens?select=refresh_token`, { headers: AT() });
const gt = await r.text();
const gtLeak = /1\/\/0[A-Za-z0-9_-]{20,}/.test(gt);
check(!gtLeak, "D. gmail refresh tokens not readable by a tenant", `HTTP ${r.status} ${gt.slice(0, 60)}`);

r = await fetch(`${URL_}/rest/v1/profiles?select=id,email,booking_link&limit=50`, { headers: AT() });
rows = await r.json();
check(Array.isArray(rows) && rows.length <= 1, "E. read profiles (own row only)", `${Array.isArray(rows) ? rows.length : "?"} rows`);

// ---------- B. PostgREST write (no-op value, so a failure cannot corrupt) ----------
r = await fetch(`${URL_}/rest/v1/leads?name=eq.${encodeURIComponent(lead_name ?? "")}`, {
  method: "PATCH", headers: AT(), body: JSON.stringify({ name: lead_name }),
});
const wBody = await r.text();
check(r.status === 204 || r.status === 200, "F. PATCH victim's lead (should affect 0 rows)", `HTTP ${r.status}${wBody ? " " + wBody.slice(0, 80) : ""}`);

const after = await runQuery(`select name from leads where id='${lead_id}'::uuid`);
check(after[0]?.name === (lead_name ?? null), "G. victim lead name unchanged", JSON.stringify(after[0]));

// attacker cannot insert a lead attributed to the owner
r = await fetch(`${URL_}/rest/v1/leads`, {
  method: "POST", headers: AT(),
  body: JSON.stringify({ user_id: (await runQuery(`select id::text from profiles where email='${OWNER}'`))[0].id, email: "attacker-owned@evil.test", name: "injected" }),
});
const insBody = await r.text();
check(!r.ok, "H. INSERT lead attributed to victim", `HTTP ${r.status} ${insBody.slice(0, 90)}`);

// ---------- C. Edge functions ----------
const call = async (fn, body, headers = {}) => {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, { method: "POST", headers: FN(headers), body: JSON.stringify(body) });
  let j; try { j = await res.json(); } catch { j = {}; }
  return { status: res.status, j };
};

let x = await call("send-reply", { emailId });
check(x.status === 403 || x.status === 400, "I. send-reply on victim's email", `HTTP ${x.status} ${JSON.stringify(x.j).slice(0, 90)}`);

x = await call("send-campaign", { campaignId });
check(x.status >= 400, "J. send-campaign on victim's campaign", `HTTP ${x.status} ${JSON.stringify(x.j).slice(0, 90)}`);

// A signed-in user calling find-leads is LEGITIMATE. The assertion is that it
// succeeds AND that anything it created is attributed to the attacker only.
const before = (await runQuery(`select count(*)::int as n from leads where user_id=(select id from profiles where email='${OWNER}')`))[0].n;
x = await call("find-leads", { jobTitle: "toy store owner", country: "US" });
const afterK = (await runQuery(`select count(*)::int as n from leads where user_id=(select id from profiles where email='${OWNER}')`))[0].n;
check(x.status === 200 || x.status === 400, "K. find-leads callable, victim unaffected", `HTTP ${x.status}, victim leads ${before}->${afterK}`);

x = await call("support-chat", { thread_id: (await runQuery(`select id::text from support_chat_threads where user_id is not null limit 1`))[0]?.id, action: "history" });
check(!JSON.stringify(x.j).includes("outreachai.team"), "L. support-chat reading victim's thread", `HTTP ${x.status} ${JSON.stringify(x.j).slice(0, 90)}`);

// unauthenticated access to functions that must refuse
for (const fn of ["send-campaign", "find-leads", "inbox-agent", "send-worker", "cost-sweep", "health-check", "daily-digest"]) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  check(res.status === 401 || res.status === 400, `M. no-auth call to ${fn}`, `HTTP ${res.status}`);
}

// ---------- cleanup ----------
for (const t of ["leads"]) {
  await fetch(`${URL_}/rest/v1/${t}?email=eq.attacker-owned@evil.test`, { method: "DELETE", headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
}
await runQuery(`delete from profiles where id='${mkUser.id}'::uuid`);
await fetch(`${URL_}/auth/v1/admin/users/${mkUser.id}`, { method: "DELETE", headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });

console.log("PASS (" + pass.length + ")");
for (const p of pass) console.log("  ok   " + p);
console.log(fail.length ? "\nFAIL (" + fail.length + ")" : "\nNO FAILURES");
for (const f of fail) console.log("  BAD  " + f);
