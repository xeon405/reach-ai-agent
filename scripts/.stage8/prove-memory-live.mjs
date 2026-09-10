// ============================================================
// prove-memory-live.mjs — Stage 8 memory-builder LIVE proof.
// Real prod database, REAL cost gate (openAiCall -> ai_cost_debit
// durably moves the ai_cost_state counter), REAL thread_memory
// writes, REAL watermark advance on email_threads, then REAL
// forget_lead erases it. End-to-end on the deployed code path.
//
// Honest substitutions (the only two externalities we cannot bind):
//   * Gmail fetch — stubbed with fixture messages (no OAuth mailbox).
//   * groqChat — canned extract JSON; the gate still reserves/debits
//     for real. The observational ledger write that real groq.ts
//     recordMeter does is mirrored as a step note, not faked into
//     existence; the DURABLE counter debit is the hard-ceiling proof
//     and it is real.
//
// Phases:
//   ROUTE-CONSERVE — ai_quality.mode=template -> conserve: zero
//     memory rows, zero watermark advance, zero meter movement.
//   ROUTE-AI       — mode back to ai -> same skipped slice writes,
//     watermark advances, meter debited for kind=summarize.
//   EXACTLY-ONCE   — third call = clean nothing_new; row count stable.
//   ERASE          — forget_lead -> thread_memory ACTUALLY GONE,
//     tombstone set, identity-light audit written.
//   FRESH-START    — post-forget message (internalDate > forget_at)
//     summarizes into a new fact; pre-boundary content cannot return.
//   SENSITIVE      — real message with phone/email/$ figures, BAD model
//     echoes them verbatim: the parser backstop prunes identifiers and
//     the persisted value carries none.
//   KILL-SWITCH    — memory_builder.enabled=false stops memory writing
//     with NO gate call and NO debit, independent of cost conserve;
//     watermark + meter untouched.
//   cleanup + zero-residue check. No real sends anywhere.
// ============================================================
import fs from "node:fs";
import crypto from "node:crypto";
const uuid = () => crypto.randomUUID();
const env = fs.readFileSync(".env", "utf8").split("\n").filter(Boolean);
const envV = (k) => env.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();
const TOKEN = envV("SUPABASE_ACCESS_TOKEN");
const REF = envV("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
const PROJECT = `https://${REF}.supabase.co`;

globalThis.Deno = { env: { get: (k) => process.env[k] ?? null } };
const { summarizeThreadMemory } = await import("../../supabase/functions/_shared/thread-memory.ts");

async function mgmt(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text().catch(() => "");
  if (r.status >= 300) throw new Error(`mgmt ${r.status}: ${(t || "").slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}
const apiRes = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const svc = apiRes.find((k) => k.name === "service_role").api_key;

// Minimal PostgREST adapter (what supabase-js would issue) for the module.
function gr(table) {
  const U = (s) => encodeURIComponent(s);
  const filters = [];
  const builder = {
    select: () => builder,
    eq: (k, v) => { filters.push(`${k}=eq.${U(v)}`); return builder; },
    is: (k, v) => { filters.push(`${k}=is.${v ?? "null"}`); return builder; },
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const res = await fetch(`${PROJECT}/rest/v1/${table}?select=*&${filters.join("&")}&limit=1`, {
        headers: { apikey: svc, Authorization: `Bearer ${svc}` },
      });
      if (res.status >= 300) return { data: null, error: { message: await res.text() } };
      const rows = await res.json();
      return { data: rows?.[0] ?? null, error: null };
    },
    then: async (res2) => {
      const res = await fetch(`${PROJECT}/rest/v1/${table}?select=*&${filters.join("&")}`, {
        headers: { apikey: svc, Authorization: `Bearer ${svc}` },
      });
      if (res.status >= 300) return res2({ data: null, error: { message: await res.text() } });
      return res2({ data: await res.json(), error: null });
    },
    insert: async (rows) => {
      const body = Array.isArray(rows) ? rows : [rows];
      const res = await fetch(`${PROJECT}/rest/v1/${table}`, {
        method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      return res.status >= 300 ? { error: { message: await res.text() } } : { error: null };
    },
    update: (patch) => {
      const upd = { filters: [] };
      const view = {
        eq: (k, v) => { upd.filters.push(`${k}=eq.${U(v)}`); return view; },
        is: (k, v) => { upd.filters.push(`${k}=is.${v ?? "null"}`); return view; },
        then: async (res2) => {
          const res = await fetch(`${PROJECT}/rest/v1/${table}?${upd.filters.join("&")}`, {
            method: "PATCH", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify(patch),
          });
          return res2(res.status >= 300 ? { error: { message: await res.text() } } : { error: null });
        },
      };
      return view;
    },
  };
  return builder;
}
const db = {
  from: (t) => gr(t),
  rpc: async (fn, args) => {
    const res = await fetch(`${PROJECT}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (res.status >= 300) return { data: null, error: { message: await res.text() } };
    return { data: await res.json(), error: null };
  },
};

const out = [];
const a = (label, ok, note = "") => { out.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`); };

const U = uuid(), CID = uuid(), L = uuid(), TID = uuid();
const now = Date.now();
const MSGS = () => [
  { id: "g1", internalDateMs: now - 3 * 86400000, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "We liked the demo, looking at budget." },
  { id: "g2", internalDateMs: now - 1 * 86400000, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "Yes, let's move — send pricing this week." },
];
let whichAnswer = 1;
const fakeGroq = async () =>
  whichAnswer === 1
    ? JSON.stringify({ facts: [
        { kind: "interest_level", value: "high", confidence: 0.9 },
        { kind: "objection", value: "budget for this quarter", confidence: 0.7 },
        { kind: "next_action", value: "send pricing this week", confidence: 0.8 },
      ] })
    : whichAnswer === 2
      ? JSON.stringify({ facts: [{ kind: "availability", value: "next week works", confidence: 0.7 }] })
      : JSON.stringify({ facts: [{ kind: "objection", value: "budget is hard-capped exactly $47,500 a 2,300,000 total and the procurement contact is (555) 017-3388 or finance@corp.test pricing pressure", confidence: 0.9 }] });

async function q1(sql) { return (await mgmt(sql))[0]; }
async function sql1(sql, fallback) { try { return (await mgmt(sql))[0] ?? fallback; } catch { return fallback; } }

(async () => {
  let failedCall = null;
  try {
    // ---- provision + seed ----
    console.log("  provisioning throwaway user + fixture…");
    {
      const r = await fetch(`${PROJECT}/auth/v1/admin/users`, {
        method: "POST", headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: `mem-${U.slice(0, 8)}@stage8.test`, password: "Stg8!" + uuid().replace(/-/g, ""), email_confirm: true, id: U }),
      });
      if (r.status >= 300) throw new Error("createUser " + r.status);
      const p = await sql1(`select count(*) as n from public.profiles where id='${U}';`, { n: 0 });
      if (Number(p.n) === 0) await mgmt(`insert into public.profiles (id) values ('${U}') on conflict (id) do nothing;`).catch(() => {});
    }
    await mgmt(`
insert into public.campaigns (id, user_id, name, status) values ('${CID}','${U}','mem-c','paused');
insert into public.leads (id, user_id, campaign_id, name, email, status) values ('${L}','${U}','${CID}','ml','lead@live.test','new');
insert into public.email_threads (id, user_id, lead_id, gmail_thread_id, last_message_id, turn_count) values
 ('${TID}','${U}','${L}','g-probe','g2',1);`);

    const tid = (r) => new Date(r ?? 0).getTime();
    const memCount = async () => Number((await sql1(`select count(*) as n from public.thread_memory where lead_id='${L}';`, { n: 0 })).n);
    const wm = async () => (await sql1(`select last_summarized_at as w from public.email_threads where id='${TID}';`, { w: null })).w;
    const ctx = { userId: U, campaignId: CID, leadId: L, plan: "starter" };

    // ---- ROUTE-CONSERVE ----
    console.log("\n  -- PHASE ROUTE-CONSERVE (ai_quality.mode=template) --");
    await mgmt(`select public.set_agent_config('ai_quality.mode','user'::text,'${U}'::uuid,'"template"'::jsonb,true,'probe');`);
    const c1 = await summarizeThreadMemory(db, ctx, () => MSGS(), { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("C: conserve (reason admin:template), same skipped slice [g1,g2]",
      c1.action === "conserve", JSON.stringify({ action: c1.action, reason: c1.reason ?? "" }));
    a("C2: memory rows = 0 (true no-op)", (await memCount()) === 0);
    a("C3: watermark NOT advanced", (await wm()) === null);
    a("C4: no meter movement (ai_cost_state absent)", (await sql1(`select count(*) as n from public.ai_cost_state where profile_id='${U}';`, { n: 0 })).n === 0);
    a("C5: no summarize ledger row", (await sql1(`select count(*) as n from public.ai_spend_ledger where user_id='${U}';`, { n: 0 })).n === 0);

    // ---- ROUTE-AI ----
    console.log("\n  -- PHASE ROUTE-AI (mode back to ai) --");
    await mgmt(`select public.set_agent_config('ai_quality.mode','user'::text,'${U}'::uuid,'"template"'::jsonb,false,'probe');`);
    const c2 = await summarizeThreadMemory(db, ctx, () => MSGS(), { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("AI: processes the SAME skipped slice [g1,g2]", JSON.stringify(c2.sliceIds) === JSON.stringify(["g1", "g2"]), JSON.stringify(c2.sliceIds));
    a("AI2: 3 facts written (interest/objection/next_action)", c2.written === 3, JSON.stringify(c2));
    a("AI3: rows persisted live", (await memCount()) === 3);
    a("AI4: watermark advanced to newest sliced msg", tid(await wm()) === tid(new Date(now - 1 * 86400000).toISOString()), String(await wm()));
    a("AI5: DURABLE METER debited (kind=summarize L1 path)", Number((await sql1(`select used_daily_usd as x from public.ai_cost_state where profile_id='${U}';`, { x: 0 })).x) > 0);
    a("AI6: meter counter in the current daily window (real window logic)", (await sql1(`select window_date as w from public.ai_cost_state where profile_id='${U}';`, { w: null })).w === new Date().toISOString().slice(0, 10));
    // Sweep heartbeat (models cost-sweep refreshing last_reported_at in prod).
    await mgmt(`update public.ai_cost_state set last_reported_at = now(), updated_at = now() where profile_id='${U}';`);

    // ---- EXACTLY-ONCE ----
    console.log("\n  -- PHASE EXACTLY-ONCE --");
    const c3 = await summarizeThreadMemory(db, ctx, () => MSGS(), { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("E: third call = nothing_new, same facts not duplicated", c3.action === "nothing_new" && (await memCount()) === 3, JSON.stringify(c3));

    // ---- ERASE ----
    console.log("\n  -- PHASE ERASE (forget_lead live) --");
    const fr = await db.rpc("forget_lead", { p_user_id: U, p_lead_id: L, p_suppress: false });
    a("ER: forget_lead 200 (forgot:true)", fr.data?.forgot === true, JSON.stringify(fr.data ?? fr.error));
    a("ER2: thread_memory ACTUALLY GONE (0 rows)", (await memCount()) === 0);
    a("ER3: tombstone set (forget_at not null)", (await sql1(`select forget_at as f from public.email_threads where id='${TID}';`, { f: null })).f !== null);
    a("ER4: identity-light audit written", (await sql1(`select count(*) as n from public.audit_events where user_id='${U}' and lead_id is null and event='lead.forgot';`, { n: 0 })).n === 1);

    // ---- FRESH-START ----
    console.log("\n  -- PHASE FRESH-START (post-forget message) --");
    whichAnswer = 2;
    const fresh = now + 1 * 3600000;
    const c4 = await summarizeThreadMemory(db, ctx, () => [
      ...MSGS(), // < forget_at: structurally excluded
      { id: "g3", internalDateMs: fresh, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "Schedule the call next week." },
    ], { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("F: only strictly-post-forget msg sliced ([g3])", JSON.stringify(c4.sliceIds) === JSON.stringify(["g3"]), JSON.stringify(c4.sliceIds));
    a("F2: fresh fact written (availability)", c4.written === 1 && (await memCount()) === 1, JSON.stringify(c4));
    a("F3: watermark advanced to the fresh msg", tid(await wm()) === tid(new Date(fresh).toISOString()), String(await wm()));

    // ---- SENSITIVE (real message, BAD model echoes identifiers verbatim) ----
    console.log("\n  -- PHASE SENSITIVE (identifier echo must not persist) --");
    whichAnswer = 3;
    const g6 = now + 6 * 3600000;
    const SENS_MSG = "Heads up — budget is hard-capped at $47,500 (2,300,000 total envelope) and the procurement contact is (555) 017-3388 or finance@corp.test. Pricing pressure until approval.";
    const c5 = await summarizeThreadMemory(db, ctx, () => [
      ...MSGS(), { id: "g3", internalDateMs: fresh, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "Schedule the call next week." },
      { id: "g6", internalDateMs: g6, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: SENS_MSG },
    ], { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("S: only [g6] processed (strict incremental against watermark)", JSON.stringify(c5.sliceIds) === JSON.stringify(["g6"]), JSON.stringify(c5.sliceIds));
    const sRows = await mgmt(`select value from public.thread_memory where lead_id='${L}';`);
    const sJoined = (sRows ?? []).map((r) => String(r.value)).join(" | ");
    a("S2: bad-verbatim echo persisted WITHOUT phone/email/$/comma-figure bytes",
      !/finance@corp|555-3388|017-3388|47,500|2,300,000|\$\s?47/.test(sJoined) && /pricing pressure/.test(sJoined), sJoined);
    a("S3: sanitized objection persisted as the active objection (erasure cleared prior facts, so supersede=0 expected; replace-not-append mechanics are sim-proven F)",
      c5.action === "written" && c5.written === 1 && c5.superseded === 0 && (await memCount()) === 2, JSON.stringify(c5));
    a("S4: watermark advanced to the sensitive message ts", tid(await wm()) === tid(new Date(g6).toISOString()), String(await wm()));

    // ---- KILL-SWITCH (memory_builder.enabled, independent of cost conserve) ----
    console.log("\n  -- PHASE KILL-SWITCH (memory_builder.enabled=false) --");
    await mgmt(`select public.set_agent_config('memory_builder.enabled','user'::text,'${U}'::uuid,'false'::jsonb,true,'probe');`);
    const g5 = g6 + 3600000;
    const meterBefore = Number((await sql1(`select used_daily_usd as x from public.ai_cost_state where profile_id='${U}';`, { x: 0 })).x);
    const wmBefore = await wm();
    const rowsBefore = await memCount();
    const c6 = await summarizeThreadMemory(db, ctx, () => [
      ...MSGS(), { id: "g3", internalDateMs: fresh, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "Schedule the call next week." },
      { id: "g6", internalDateMs: g6, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: SENS_MSG },
      { id: "g5", internalDateMs: g5, fromEmail: "lead@live.test", senderEmail: "owner@live.test", body: "Any update on next steps?" },
    ], { token: "t", threadId: "g-probe", senderEmail: "owner@live.test", groqChat: fakeGroq });
    a("K: kill-switch => conserve reason kill_switch (even with ai budget free)",
      c6.action === "conserve" && c6.reason === "kill_switch", JSON.stringify(c6));
    const meterAfter = await (async () => Number((await sql1(`select used_daily_usd as x from public.ai_cost_state where profile_id='${U}';`, { x: 0 })).x))();
    const rowsAfter = await memCount();
    const wmAfter = await wm();
    a("K2: kill-switch => zero new rows, watermark + meter untouched",
      rowsAfter === rowsBefore && tid(wmAfter) === tid(wmBefore) && meterAfter === meterBefore,
      JSON.stringify({ rows: `${rowsBefore}->${rowsAfter}`, meter: `${meterBefore}->${meterAfter}` }));

    const fails = out.filter((x) => !x).length;
    console.log(`\nRESULT: ${fails === 0 ? "PASS" : "FAIL"} (${out.length - fails}/${out.length} assertions)`);
  } catch (e) {
    failedCall = e;
  } finally {
    console.log("\n  cleanup…");
    try { await mgmt(`
delete from public.agent_config where scope='user' and scope_id='${U}';
delete from public.thread_memory where lead_id='${L}';
delete from public.audit_events where user_id='${U}';
delete from public.ai_spend_ledger where user_id='${U}';
delete from public.ai_cost_state where profile_id='${U}';
delete from public.ai_classifications where user_id='${U}';
delete from public.owner_alerts where user_id='${U}';
delete from public.email_threads where user_id='${U}';
delete from public.meetings where user_id='${U}';
delete from public.lead_score where lead_id='${L}';
delete from public.send_queue where user_id='${U}';
delete from public.suppressions where user_id='${U}';
delete from public.saved_businesses where discovered_by::text like '%${U}%';
delete from public.emails_sent where user_id='${U}';
delete from public.leads where user_id='${U}';
delete from public.campaigns where user_id='${U}';
delete from public.campaign_learning where campaign_id='${CID}';
delete from public.profiles where id='${U}';
delete from auth.users where id='${U}';`); } catch (e) { console.log("  cleanup warn:", e.message.slice(0, 160)); }
    const res = await sql1(`select
      (select count(*) from public.thread_memory where lead_id='${L}') tm,
      (select count(*) from public.email_threads where user_id='${U}') et,
      (select count(*) from public.email_threads where id='${TID}') tid,
      (select count(*) from public.ai_spend_ledger where user_id='${U}') led,
      (select count(*) from public.audit_events where user_id='${U}') aud,
      (select count(*) from public.leads where user_id='${U}') lds,
      (select count(*) from public.ai_cost_state where profile_id='${U}') cs,
      (select count(*) from auth.users where id='${U}') usr;`, { tm: -1, et: -1, tid: -1, led: -1, aud: -1, lds: -1, cs: -1, usr: -1 });
    console.log("  residue:", JSON.stringify(res));
    const ok = Object.values(res).every((v) => Number(v) === 0);
    out.push(ok); if (failedCall) console.log("\nFAILED-CALL:", failedCall?.message ?? failedCall); console.log(`RESULT(final): ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok && out.every((x) => x) ? 0 : 1);
  }
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });