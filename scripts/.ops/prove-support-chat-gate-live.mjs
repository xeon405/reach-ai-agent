// Live end-to-end proof that the support-chat gate wiring is engaged (POST-fix).
//  PRESENTED behavior:
//    GUEST 1) a normal guest message is answered by the LLM AND the shared
//             visitor bucket (ai_cost_guest_state) now carries real spend —
//             reserve settled to actual, plus a ledger row (fn=support-chat,
//             user_id=null). Previously this was zero-accounting.
//    GUEST 2) with the bucket forced to its daily ceiling, the same visitor gets
//             a calm static line (BUSY_LINE), ZERO LLM, ZERO new ledger rows —
//             and, after restoring the counter, recovers immediately.
//    USER  3) a real signed-in session consumes the daily chat allowance
//             (consume_ai_quota) and its USD pools (ai_cost_state reserve/settle)
//             — the logged-in M2/USD bypass is closed.
//    USER  4) with the daily count forced over AI_CHAT_DAILY_CAP, the user gets
//             DAILY_LIMIT_LINE with no LLM, no ledger, no pool movement.
//  Small spend: 2 guest LLM calls + 1 logged-in LLM call, one-word prompts.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as db from "./_db.mjs";

const ENV = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const SITE = ENV.SUPABASE_URL ?? `https://${ENV.SUPABASE_PROJECT_REF}.supabase.co`;
// Current project service key, fetched live from the Management API (keys rotate;
// never trust a stale copy in .env).
const SVC = (
  await (await fetch(`https://api.supabase.com/v1/projects/${ENV.SUPABASE_PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${ENV.SUPABASE_ACCESS_TOKEN}` },
  })).json()
).find((k) => k.name === "service_role").api_key;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BUSY = "I'm catching my breath after a busy stretch — give me a minute and send that again. If it's urgent, email outshipai@gmail.com.";
const DAILY = "You've hit today's support-chat limit — it resets each day. For anything urgent, email outshipai@gmail.com.";

const GUEST = randomUUID();
let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  PASS ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };

async function guestChat(text) {
  const res = await fetch(`${SITE}/functions/v1/support-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-guest-id": GUEST },
    body: JSON.stringify({ text }),
  });
  return res.json();
}
async function userChat(token, text) {
  const res = await fetch(`${SITE}/functions/v1/support-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  return res.json();
}
const ledCount = () => db.runQuery(`select count(*)::int c from ai_spend_ledger where fn='support-chat';`).then((r) => r[0].c);

console.log("GUEST 1 — gated LLM with real accounting");
{
  const before = await ledCount();
  const r = await guestChat("hi");
  check(r.status === undefined && String(r.reply ?? "").length > 0 && r.reply !== BUSY, "guest answered by LLM (not the busy line)");
  await sleep(4000); // meter flush
  const after = await ledCount();
  check(after === before + 1, `exactly one new ai_spend_ledger row for guest chat (${before} -> ${after})`);
  const ledger = await db.runQuery(`select fn, kind, user_id, model, est_cost_usd from ai_spend_ledger where fn='support-chat' order by ts desc limit 1;`);
  check(ledger[0]?.fn === "support-chat" && ledger[0]?.kind === "chat" && ledger[0]?.user_id === null, "ledger row is fn=support-chat kind=chat user_id=null");
  const st = await db.runQuery(`select coalesce(max(used_daily_usd),0) u, coalesce(max(used_monthly_usd),0) m from ai_cost_guest_state;`);
  check(st[0].u > 0, `guest bucket carries real settled spend (used_daily_usd=${st[0].u}) — previously zero accounting`);
}

console.log("GUEST 2 — ceiling refusal is a graceful static line, zero spend");
{
  const { data } = await db.runQuery(`select coalesce(used_daily_usd,0) as u from ai_cost_guest_state where id=true;`).then((r) => ({ data: r }));
  const prevDaily = data[0]?.u ?? 0;
  await db.runQuery(`update ai_cost_guest_state set used_daily_usd=0.10, last_reported_at=now(), updated_at=now() where id=true;`);
  const before = await ledCount();
  const r = await guestChat("you blocked?");
  check(String(r.reply ?? "") === BUSY, "busy line returned at the ceiling (exact match)");
  await sleep(4000);
  const after = await ledCount();
  check(after === before, `no new ledger row while refused (${before} -> ${after})`);
  await db.runQuery(`update ai_cost_guest_state set used_daily_usd=${prevDaily}, updated_at=now() where id=true;`);
  const r2 = await guestChat("back?");
  check(String(r2.reply ?? "") !== BUSY, "bucket restored => guest recovers immediately");
}

console.log("USER — signed-in chat now consumes quota + USD pools");
{
  const email = `gate-probe-${Date.now()}@example.com`;
  const password = "probe-pass-9";
  const cr = await fetch(`${SITE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await cr.json();
  check(!!user.id, "ephemeral auth user created");
  const uid = user.id;
  await sleep(1500); // on_auth_user_created trigger populates profiles
  const prof = await db.runQuery(`select id from public.profiles where id='${uid}';`);
  check(prof.length === 1, "profile auto-created by trigger");

  const tr = await fetch(`${SITE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SVC, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const sess = await tr.json();
  check(!!sess.access_token, "session token minted");

  const before = await ledCount();
  const r = await userChat(sess.access_token, "hello from account");
  check(String(r.reply ?? "") !== DAILY && String(r.reply ?? "") !== BUSY, "logged-in chat answered by LLM (not a limit line)");
  await sleep(5000);
  const after = await ledCount();
  check(after === before + 1, `one ledger row for the user's chat (${before} -> ${after})`);
  const ld = await db.runQuery(`select user_id, fn, kind, est_cost_usd from ai_spend_ledger where fn='support-chat' and user_id='${uid}' limit 1;`);
  check(ld[0]?.user_id === uid && ld[0]?.kind === "chat", "ledger row attributed to the signed-in user");
  const q = await db.runQuery(`select ai_generated_today as t from public.profiles where id='${uid}';`);
  check(q[0].t === 1, `consume_ai_quota consumed the daily count (ai_generated_today=${q[0].t})`);
  const cs = await db.runQuery(`select used_daily_usd as u from public.ai_cost_state where profile_id='${uid}';`);
  check(cs.length === 1 && Number(cs[0].u) > 0 && Number(cs[0].u) < 0.1, `logged-in chat moved the USER's durable pool (used_daily_usd=${cs[0]?.u})`);

  await db.runQuery(`update public.profiles set ai_generated_today=100 where id='${uid}';`);
  const b2 = await ledCount();
  const r2 = await userChat(sess.access_token, "again");
  check(String(r2.reply ?? "") === DAILY, "daily-count ceiling => DAILY_LIMIT_LINE (exact match)");
  await sleep(4000);
  const a2 = await ledCount();
  check(a2 === b2, `no LLM/ledger while over the count cap (${b2} -> ${a2})`);

  const del = await fetch(`${SITE}/auth/v1/admin/users/${uid}`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  check(del.status === 200 || del.status === 204, "ephemeral user deleted");
  await sleep(1500);
  const gone = await db.runQuery(`select (select count(*) from public.profiles where id='${uid}') p, (select count(*) from public.ai_cost_state where profile_id='${uid}') s, (select count(*) from public.support_chat_threads where user_id='${uid}') t, (select count(*) from public.ai_spend_ledger where user_id='${uid}') l, (select count(*) from public.support_chat_messages where thread_id in (select id from public.support_chat_threads where user_id='${uid}')) m;`);
  check(gone[0].p === 0 && gone[0].s === 0 && gone[0].t === 0 && gone[0].l === 0 && gone[0].m === 0, "user + profile + cost state + threads cascade-cleaned; ledger user nulled");
}

// cleanup: guest threads from this probe
{
  const thr = await db.runQuery(`select id from public.support_chat_threads where guest_id='${GUEST}';`);
  for (const t of thr) {
    await fetch(`${SITE}/functions/v1/support-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-id": GUEST },
      body: JSON.stringify({ thread_id: t.id, action: "delete" }),
    });
  }
  const left = await db.runQuery(`select count(*)::int c from public.support_chat_threads where guest_id='${GUEST}';`).then((r) => r[0].c);
  console.log("guest probe threads remaining:", left);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);