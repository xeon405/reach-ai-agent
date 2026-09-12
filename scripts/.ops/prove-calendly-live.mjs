// LIVE proof: calendly-webhook (deployed) + get-calendly-config (deployed).
// Requires, BEFORE running:
//   1) migration 20260913000000_meetings_growth.sql applied (verified internally)
//   2) calendly-webhook deployed with verify_jwt=false, get-calendly-config deployed
//      (verify_jwt=true), CALENDLY_WEBHOOK_SECRET set on the functions.
// Proves, against the real deployment + real DB (read-only on real data; all
// fixture rows are created under ephemeral users and torn down at the end):
//   A) signature gate: unsigned/tampered POST => 401, zero side effects
//   B) invitee.created => meeting row (status=started scheduled), lead advanced:
//        lifecycle->BOOKING, status='booked', followup stopped, high-priority
//        owner alert + booking.confirmed audit
//   C) idempotent replay of the same event => no second meeting row
//   D) owner-scoped attribution: same invitee email under a DIFFERENT owner whose
//        booking_link does NOT match => zero side effects for that other owner
//   E) invitee.canceled => existing row flipped to cancelled (no new row, no
//        follow-up resume)
//   F) blind calendar (untracked ownerKey) => 200 with no_owner, zero side effects
//   G) get-calendly-config: 401 without a user JWT; 200 + url + secret with one
import { createHmac } from "node:crypto";
import { getEnv } from "./_db.mjs";

const REF = getEnv("SUPABASE_PROJECT_REF");
const SITE = getEnv("SUPABASE_URL") ?? `https://${REF}.supabase.co`;
const MANAGER = getEnv("SUPABASE_ACCESS_TOKEN");
const WEBHOOK_SECRET = getEnv("CALENDLY_WEBHOOK_SECRET");
if (!WEBHOOK_SECRET) throw new Error("CALENDLY_WEBHOOK_SECRET missing from .env");

const b = (query) =>
  fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MANAGER}`, "Content-Type": "application/json", Accept: "application/json", "Connection": "close" },
    body: JSON.stringify({ query }),
  }).then(async (r) => (r.ok ? r.json() : await Promise.reject(new Error(`query (${r.status}): ${(await r.text()).slice(0, 300)}`))));

const svc = (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${MANAGER}`, "Connection": "close" } }).then((r) => r.json())).find((k) => k.name === "service_role").api_key;

let fails = 0;
let fixtureUid = null;
const created = [];
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) fails++; };
const q1 = (sql) => b(sql).then((r) => (Array.isArray(r) ? r[0] ?? null : null));
const q = (sql) => b(sql).then((r) => (Array.isArray(r) ? r : []));
const sign = (body) => { const ts = Math.floor(Date.now() / 1000); return `t=${ts},v1=${createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex")}`; };
const post = (payload, overrides = {}) => {
  const body = JSON.stringify(payload);
  return fetch(`${SITE}/functions/v1/calendly-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": sign(body), "Connection": "close", ...overrides },
    body,
  });
};

const mkUser = async (tag) => {
  const email = `${tag}-${Date.now()}@proof.test`;
  const u = await fetch(`${SITE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "cal-proof-pass-123", email_confirm: true }),
  }).then(async (r) => { const j = await r.json(); if (!r.ok || !j?.id) throw new Error(`mkUser: ${r.status} ${JSON.stringify(j).slice(0, 200)}`); return j; });
  created.push(u.id);
  return u;
};

const mkLead = async (uid, cid, name, email) => {
  const lid = (await b(`insert into leads (user_id, campaign_id, name, email, normalized_email, country, status) values ('${uid}', '${cid}', '${name}', '${email}', '${email.toLowerCase()}', 'US', 'new') returning id::text;`))[0].id;
  return lid;
};

const calEvent = (event, note, schedulingUrl, email, uuid) => ({
  event,
  created_at: "2026-09-12T00:00:00Z",
  payload: {
    scheduling_url: schedulingUrl,
    uri: `https://api.calendly.com/scheduled_events/${uuid}/invitees/${note}`,
    invitee: { uuid: `inv-${note}`, email, name: "Proof Lead", cancel_url: null, reschedule_url: null },
    scheduled_event: { uuid, slug: "intro", start_time: "2026-09-15T09:00:00Z", end_time: "2026-09-15T09:30:00Z", timezone: "America/New_York" },
    event_type: { slug: "intro" },
  },
});

try {
  // ---------- 0) precondition: migration columns live ----------
  const cols = await q(`select column_name from information_schema.columns where table_schema='public' and table_name='meetings' and column_name in ('status','provider','provider_event_id');`);
  check("0) migration applied (status/provider/provider_event_id columns present)", cols.map((c) => c.column_name).sort().join("+") === "provider+provider_event_id+status", cols.map((c) => c.column_name).join(","));

  // ---------- fixtures: owner1 (tracked), owner2 (different calendar) ----------
  const u1 = await mkUser("cal-owner1");
  const u2 = await mkUser("cal-owner2");
  fixtureUid = u1.id; // primary owner for teardown checks
  const c1 = (await b(`insert into campaigns (user_id, name, status) values ('${u1.id}', 'cal-live', 'active') returning id::text;`))[0].id;
  const c2 = (await b(`insert into campaigns (user_id, name, status) values ('${u2.id}', 'cal-live2', 'active') returning id::text;`))[0].id;
  const ACCOUNT = `proofacc-${Date.now()}`;
  const ALIAS = `proofalias-${Date.now()}`;
  await b(`update profiles set booking_link = 'https://calendly.com/${ACCOUNT}/15min' where id = '${u1.id}';`);
  await b(`update profiles set booking_link = 'https://calendly.com/${ALIAS}/45min' where id = '${u2.id}';`);

  const addr = `samelead-${Date.now()}@proof.test`;
  const L1 = await mkLead(u1.id, c1, "Owner1 Lead", addr); // owner1 only
  const L2 = await mkLead(u2.id, c2, "Owner2 Lead", addr); // owner2 has SAME email, different calendar

  // fast-forward lifcycle of L1 to a non-terminal state the booking advances from
  await b(`update leads set lifecycle='CONTACTED', followup_status='active', next_followup_at=now()+interval '1 day', followup_step=3 where id='${L1}';`);

  const UUID = `evt-${Date.now()}`;

  // ---------- A) signature gate ----------
  const badBody = JSON.stringify(calEvent("invitee.created", "x", `https://calendly.com/${ACCOUNT}/15min`, addr, UUID));
  const tampered = await fetch(`${SITE}/functions/v1/calendly-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`, "Connection": "close" },
    body: badBody,
  });
  check("A) tampered signature => 401", tampered.status === 401, `(${tampered.status})`);
  const missing = await fetch(`${SITE}/functions/v1/calendly-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Calendly-Webhook-Signature": "", "Connection": "close" },
    body: badBody,
  });
  check("A) missing signature => 401", missing.status === 401, `(${missing.status})`);
  check("A) zero side effects from rejected posts (no meetings, no audit)", (await qcMeetings(u1.id)) === 0 && (await q(`select 1 from audit_events where user_id in ('${u1.id}','${u2.id}') and event like 'booking.%';`)).length === 0);

  // ---------- B) invitee.created => booked ----------
  const r1 = await post(calEvent("invitee.created", "y", `https://calendly.com/${ACCOUNT}/15min`, addr, UUID));
  const j1 = await r1.json().catch(() => null);
  check("B) signed invitee.created => 200 + booked:1", r1.status === 200 && j1?.booked === 1 && j1?.event === "invitee.created", `(${r1.status} ${JSON.stringify(j1)?.slice(0, 120)})`);
  const mtg = await q1(`select status, provider, provider_event_id, lead_id, user_id, invitee_email, start_time from meetings where user_id='${u1.id}';`);
  check("B) meetings row created (provider=calendly, status=scheduled)", !!mtg && mtg.provider === "calendly" && mtg.status === "scheduled" && mtg.provider_event_id === UUID && mtg.lead_id === L1 && mtg.invitee_email === addr, JSON.stringify(mtg ?? null));
  const lead = await q1(`select lifecycle, status, followup_status, next_followup_at from leads where id='${L1}';`);
  check("B) lead advanced: lifecycle=BOOKING, status=booked, followup cancelled+no next", lead?.lifecycle === "BOOKING" && lead?.status === "booked" && lead?.followup_status === "cancelled" && lead?.next_followup_at === null, JSON.stringify(lead));
  const alert = await q1(`select kind, priority, title from owner_alerts where user_id='${u1.id}' and kind='booking';`);
  check("B) owner alert kind=booking, priority=high", !!alert && alert.kind === "booking" && alert.priority === "high", JSON.stringify(alert ?? null));
  const aud = await q(`select event from audit_events where user_id='${u1.id}' and event='booking.confirmed';`);
  check("B) booking.confirmed audit written", aud.length === 1, `(${aud.length})`);

  // ---------- C) idempotent replay ----------
  const r2 = await post(calEvent("invitee.created", "y2", `https://calendly.com/${ACCOUNT}/15min`, addr, UUID));
  const j2 = await r2.json().catch(() => null);
  check("C) replay => 200 + booked:0 (duplicate)", r2.status === 200 && j2?.booked === 0, `(${r2.status} ${JSON.stringify(j2)?.slice(0, 120)})`);
  check("C) still exactly one meetings row for the event", (await q(`select 1 from meetings where user_id='${u1.id}' and provider='calendly' and provider_event_id='${UUID}';`)).length === 1);

  // ---------- D) owner-scoped attribution ----------
  const mtgOther = await q(`select 1 from meetings where user_id='${u2.id}';`);
  const leadOther = await q1(`select lifecycle, followup_status from leads where id='${L2}';`);
  const audOther = await q(`select 1 from audit_events where user_id='${u2.id}' and event like 'booking.%';`);
  check("D) same invitee email under different owner (unmatched booking_link) => no side effects", mtgOther.length === 0 && leadOther?.lifecycle === "NEW" && leadOther?.followup_status === "none" && audOther.length === 0, `meetings=${mtgOther.length} other=${JSON.stringify(leadOther)}`);

  // ---------- E) invitee.canceled ----------
  const r3 = await post(calEvent("invitee.canceled", "y3", `https://calendly.com/${ACCOUNT}/15min`, addr, UUID));
  const j3 = await r3.json().catch(() => null);
  check("E) signed cancel => 200, no new rows", r3.status === 200, `(${r3.status} ${JSON.stringify(j3)?.slice(0, 120)})`);
  const mtg2 = await q1(`select status from meetings where user_id='${u1.id}' and provider_event_id='${UUID}';`);
  check("E) existing meeting flipped to cancelled", mtg2?.status === "cancelled", JSON.stringify(mtg2));
  check("E) cancel did not create extra meetings rows", (await q(`select 1 from meetings where user_id='${u1.id}';`)).length === 1);
  check("E) booking.cancelled audit written, lead stays cancelled (no resume)", (await q(`select 1 from audit_events where user_id='${u1.id}' and event='booking.cancelled';`)).length === 1 && (await q1(`select followup_status from leads where id='${L1}';`))?.followup_status === "cancelled");

  // ---------- F) blind calendar (untracked ownerKey) ----------
  const r4 = await post(calEvent("invitee.created", "z", `https://calendly.com/someone-else/intro`, addr, `evt-blind-${Date.now()}`));
  const j4 = await r4.json().catch(() => null);
  check("F) untracked scheduling_url => 200 + no_owner, zero side effects", r4.status === 200 && j4?.no_owner === true && (await q(`select 1 from meetings where user_id in ('${u1.id}','${u2.id}');`)).length === 1, `(${r4.status} ${JSON.stringify(j4)?.slice(0, 100)})`);

  // ---------- G) get-calendly-config (auth gate + secret surfacing) ----------
  const token = await fetch(`${SITE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: svc, "Content-Type": "application/json" },
    body: JSON.stringify({ email: u1.email, password: "cal-proof-pass-123" }),
  }).then((r) => r.json());
  const anon = await fetch(`${SITE}/functions/v1/get-calendly-config`, { method: "GET", headers: { "Connection": "close" } });
  check("G) config endpoint without bearer => 401", anon.status === 401, `(${anon.status})`);
  const cfg = await fetch(`${SITE}/functions/v1/get-calendly-config`, { method: "GET", headers: { Authorization: `Bearer ${token.access_token}`, "Connection": "close" } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  check("G) config endpoint with user JWT => 200 + url + secret", cfg.status === 200 && cfg.body?.webhook_url?.endsWith("/functions/v1/calendly-webhook") && cfg.body?.webhook_secret === WEBHOOK_SECRET, `(${cfg.status} ${JSON.stringify(cfg.body)?.slice(0, 100)})`);
} catch (err) {
  console.log("ERROR during live proof:", err.message);
  fails++;
}

// helpers used inside try but defined after (hoisting safe for function decls)
async function qcMeetings(uid) { return (await q(`select 1 from meetings where user_id='${uid}';`)).length; }

// ---------- teardown ----------
if (fixtureUid) {
  for (const uid of created) {
    await b(`delete from audit_events where user_id='${uid}';`);
    await b(`delete from owner_alerts where user_id='${uid}';`);
    await b(`delete from meetings where user_id='${uid}';`);
    await b(`delete from emails_sent where user_id='${uid}';`);
    await b(`delete from leads where user_id='${uid}';`);
    await b(`delete from campaigns where user_id='${uid}';`);
  }
  for (const uid of created) {
    await fetch(`${SITE}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).catch(() => null);
  }
}
const peeps = created.length ? `id='${created.join("' or id='")}'` : "false";
const left = await q(`select 1 from profiles where ${peeps};`);
check("teardown: ephemeral users deleted & profile/rows gone", left.length === 0, `(${left.length} left)`);

console.log(`\n${fails === 0 ? "all live checks passed" : fails + " live check(s) failed"}`);
process.exitCode = fails ? 1 : 0;