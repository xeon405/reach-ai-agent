// ============================================================
// prove-memory-sim.mjs — Stage 8 memory-builder SIMULATION.
// Runs the REAL _shared/thread-memory.ts + ai-cost-gate.ts under
// Node (Deno shim + native type-stripping) against an in-memory db
// and a canned groqChat. No network, no sends.
//
// Proves (per the user-confirmed conserve criteria):
//   A. conserve = true no-op: thread_memory AND last_summarized_at
//      both unchanged (mode=template and daily-pool refuse).
//   B. exactly-once on retry: after a conserve skip, flipping the
//      gate back to ai re-processes the SAME skipped slice (same
//      message ids), writes each fact once, and advances the
//      watermark past the newest sliced message; a third call is a
//      clean nothing_new.
//   C. debit-trip conserve (ai_cost_debit ok:false => no write).
//   D. strict-incremental + forget_at boundary (internalDate >
//      coalesce(watermark, forget_at, 0); equality excluded).
//   E. whitelist enforced by the parser (non-whitelisted kinds
//      dropped), value >200 truncated.
//   F. supersede: changed same-kind fact supersedes the old row;
//      unchanged same-kind+same-value is a duplicate no-op.
//   G. no thread row / nothing new => no gate call, no write.
//   H. dedicated kill-switch (memory_builder.enabled=false) stops
//      memory writing with NO gate call/debit, independent of the
//      cost conserve marker.
//   I. value governance: a model-echoed verbatim quote with direct
//      identifiers (email, phone, $ figure) is pruned by the parser
//      backstop before it can persist.
// ============================================================
import assert from "node:assert/strict";

globalThis.Deno = { env: { get: (k) => process.env[k] ?? null } };

const { summarizeThreadMemory, memoryFactsFor, parseMemoryFacts, sanitizeMemoryValue, hasProtectedCategoryTerms, MEMORY_FACT_KINDS } =
  await import("../../supabase/functions/_shared/thread-memory.ts");

const out = [];
const a = (label, ok, note = "") => { out.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`); };

const T0 = Date.UTC(2024, 0, 15);       // forget/watermark-free epoch base
const msg = (id, day, body, fromEmail = "lead@e.com") => ({
  id, internalDateMs: T0 + day * 86400000, fromEmail, senderEmail: "owner@gmail.com", body,
});

// ---------------- mock db ----------------
function makeDb(init = {}) {
  const store = {
    thread_memory: [],          // {thread_id, lead_id, fact_kind, value, superseded_at, ...}
    email_threads: [],
    ...init,
  };
  const api = {
    store,
    rpcCalls: [],
    debitOk: true,
    configMode: null,           // 'template' | 'hard_stop' | null = ai
    configEnabled: true,
    costState: null,            // {used_daily:number, used_month:number, last_reported_at} or null
    switchOff: false,           // memory_builder.enabled=false (kill-switch)
    rpc: async (fn, args) => {
      api.rpcCalls.push({ fn, args });
      if (fn === "ai_cost_debit") return { data: api.debitOk ? { ok: true } : { ok: false } };
      return { data: null };
    },
    from: (table) => {
      const sel = { table, picks: [], eq: [], is: [], head: false };
      const q = {
        select: (...cols) => { sel.picks = cols.flat(2); return q; },
        eq: (k, v) => { sel.eq.push([k, v]); return q; },
        is: (k, v) => { sel.is.push([k, v]); return q; },
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: matchOne(sel) ?? null, error: null }),
        then: async (res) => res({ data: matchRows(sel), error: null }),
        insert: async (rows) => { applyInsert(table, rows); return { error: null }; },
        update: (patch) => {
          // supabase-js style: update() returns a thenable chainable builder.
          const cond = { eq: [], is: [] };
          const applyNow = () => {
            let rows = store[table] ?? [];
            for (const [k, v] of cond.eq) rows = rows.filter((r) => r[k] === v);
            for (const [k, v] of cond.is) rows = rows.filter((r) => (r[k] ?? null) === v);
            for (const r of rows) Object.assign(r, patch);
            return { error: null };
          };
          const q2 = {
            eq: (k, v) => { cond.eq.push([k, v]); return q2; },
            is: (k, v) => { cond.is.push([k, v]); return q2; },
            then: async (res) => res(applyNow()),
          };
          return q2;
        },
      };
      return q;
    },
  };
  function matchRows(sel) {
    let rows = store[sel.table] ?? [];
    for (const [k, v] of sel.eq) rows = rows.filter((r) => r[k] === v);
    for (const [k, v] of sel.is) rows = rows.filter((r) => (r[k] ?? null) === v);
    return rows;
  }
  function matchOne(sel) { return matchRows(sel)[0] ?? null; }
  function applyInsert(table, rows) {
    const arr = Array.isArray(rows) ? rows : [rows];
    for (const r of arr) store[table] = [...store[table], { ...r, id: `${table}-${store[table].length + 1}` }];
  }
  // Resolve chained updates (db.from(...).update(x).eq().eq().is()).
  api.applyUpdate = (table, updater) => updater;
  api.activeFacts = () => store.thread_memory.filter((f) => !f.superseded_at && f.lead_id === "L");
  return api;
}
function configRows(api) {
  const rows = [];
  if (api.configEnabled && api.configMode) rows.push({ key: "ai_quality.mode", scope: "glob", scope_id: null, value: api.configMode });
  if (api.switchOff) rows.push({ key: "memory_builder.enabled", scope: "glob", scope_id: null, value: false });
  return rows;
}
function wireConfig(api) {
  const orig = api.from;
  const wrapped = (table) => {
    if (table === "agent_config") {
      const rows = configRows(api);
      const q = {
        select: () => q,
        in: () => q,
        eq: () => q,
        then: async (res) => res({ data: rows, error: null }),
      };
      return q;
    }
    if (table === "ai_cost_state") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: api.costState, error: null }) }),
        }),
      };
    }
    return orig(table);
  };
  api.from = wrapped;
  return wrapped;
}
// Build the full-wired db for a test.
function buildDb(init = {}) {
  const api = makeDb(init);
  wireConfig(api);
  return api;
}

let groqAnswer = '{"facts":[]}';
const fakeGroq = async () => groqAnswer;

function threadRow(over = {}) {
  return { id: "tid1", user_id: "U", lead_id: "L", forget_at: null, last_summarized_at: null, ...over };
}

(async () => {
  // ---------------- G. no thread row => no-op ----------------
  {
    const api = buildDb();
    const before = api.rpcCalls.length;
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 5, "hi")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("G: no thread row => no_thread, no gate call", r.action === "no_thread" && api.rpcCalls.length === before);
  }

  // ---------------- G2. nothing_new => no write, no gate ----------------
  {
    const api = buildDb({ email_threads: [threadRow({ last_summarized_at: new Date(T0 + 9 * 86400000).toISOString() })] });
    const before = api.rpcCalls.length;
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 5, "old")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("G2: nothing_new (all msgs <= watermark) => no write", r.action === "nothing_new" && r.written === 0 && api.rpcCalls.length === before, JSON.stringify(r.sliceIds));
  }

  // ---------------- A + B: conserve then exactly-once retry ----------------
  {
    const api = buildDb({ email_threads: [threadRow({ last_summarized_at: new Date(T0 + 2 * 86400000).toISOString() })] });
    groqAnswer = JSON.stringify({ facts: [
      { kind: "interest_level", value: "high", confidence: 0.9 },
      { kind: "objection", value: "budget for this quarter", confidence: 0.8 },
      { kind: "next_action", value: "send pricing by Friday", confidence: 0.6 },
    ] });
    // A: conserve under template mode
    api.configMode = "template";
    const r1 = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m2", 3, "yes we want to move"), msg("m3", 4, "pricing please")],
      { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("A1: conserve (template) => memory unchanged + watermark NOT advanced",
      r1.action === "conserve" && api.store.thread_memory.length === 0 &&
      api.store.email_threads[0].last_summarized_at !== undefined &&
      api.store.email_threads[0].last_summarized_at === new Date(T0 + 2 * 86400000).toISOString(),
      JSON.stringify({ action: r1.action, reason: r1.reason }));
    a("A2: conserve still slices the same skipped set", r1.sliceIds.length === 2 && r1.sliceIds[0] === "m2" && r1.sliceIds[1] === "m3", JSON.stringify(r1.sliceIds));

    // B: flip to ai -> re-process EXACTLY the same slice, once
    api.configMode = null;
    const r2 = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m2", 3, "yes we want to move"), msg("m3", 4, "pricing please")],
      { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("B1: retry processes the SAME skipped slice (m2,m3)", JSON.stringify(r2.sliceIds) === JSON.stringify(["m2", "m3"]), JSON.stringify(r2.sliceIds));
    a("B2: retry writes facts through the meter (ai_cost_debit called)",
      api.rpcCalls.some((c) => c.fn === "ai_cost_debit" && c.args?.kind === undefined), JSON.stringify(api.rpcCalls.map((c) => c.fn)));
    a("B3: exactly 3 facts inserted, no duplicates", api.store.thread_memory.length === 3 && r2.written === 3, `${api.store.thread_memory.length} rows, written=${r2.written}`);
    a("B4: watermark advanced to newest sliced msg (> skipped)", typeof r2.watermarkMs === "number" && r2.watermarkMs === T0 + 4 * 86400000);
    a("B5: watermark persisted on email_threads", api.store.email_threads[0].last_summarized_at === new Date(T0 + 4 * 86400000).toISOString());

    // third call => clean no-op, nothing revisited
    const r3 = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m2", 3, "yes"), msg("m3", 4, "pricing")],
      { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("B6: post-watermark call is a clean nothing_new, fact count stable",
      r3.action === "nothing_new" && api.store.thread_memory.length === 3, JSON.stringify(r3));
  }

  // ---------------- C. debit-trip conserve ----------------
  {
    const api = buildDb({ email_threads: [threadRow()] });
    api.debitOk = false;
    groqAnswer = '{"facts":[{"kind":"interest_level","value":"high"}]}';
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "hello")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("C: debit trip => conserve (no write, no watermark)",
      r.action === "conserve" && r.reason === "debit_or_llm_refused" && api.store.thread_memory.length === 0 &&
      api.store.email_threads[0].last_summarized_at == null, JSON.stringify({ action: r.action, reason: r.reason }));
  }

  // ---------------- D. strict-incremental + forget_at boundary ----------------
  {
    const fa = T0 + 9 * 86400000; // forget decimal fraction epoch
    const api = buildDb({ email_threads: [threadRow({ forget_at: new Date(fa).toISOString(), last_summarized_at: null })] });
    groqAnswer = '{"facts":[{"kind":"commitment","value":"send invoice","confidence":0.7}]}';
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [
        { ...msg("m0", 8, "pre"), internalDateMs: fa - 86400000 },
        { ...msg("mE", 9, "at-boundary"), internalDateMs: fa },
        { ...msg("m1", 10, "post"), internalDateMs: fa + 86400000 },
      ],
      { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("D: boundary strict > forget_at (equality excluded, only strictly-after sliced)",
      r.sliceIds.length === 1 && r.sliceIds[0] === "m1", JSON.stringify({ sliceIds: r.sliceIds }));
    a("D2: watermark advanced only to newest in-slice msg", r.watermarkMs === fa + 86400000);
  }

  // ---------------- E. whitelist + truncation ----------------
  {
    const api = buildDb({ email_threads: [threadRow()] });
    const long = "x".repeat(500);
    groqAnswer = JSON.stringify({ facts: [
      { kind: "interest_level", value: "warm", confidence: 0.8 },
      { kind: "family_situation", value: "has two kids", confidence: 0.9 },       // forbidden
      { kind: "personal_opinion", value: "hates politics", confidence: 0.5 },     // forbidden
      { kind: "timing_window", value: long, confidence: 0.4 },                    // truncate
    ] });
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "hi")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    const kinds = api.store.thread_memory.map((f) => f.fact_kind).sort();
    a("E: only whitelisted kinds persist (family/personal dropped)", JSON.stringify(kinds) === JSON.stringify(["interest_level", "timing_window"]), JSON.stringify(kinds));
    a("E2: value truncated to <=200 chars", api.store.thread_memory.every((f) => f.value.length <= 200));
  }

  // ---------------- F. supersede + duplicate no-op ----------------
  {
    const pre = (kind, value) => ({ id: `f-${kind}`, thread_id: "tid1", lead_id: "L", fact_kind: kind, value, superseded_at: null });
    const api = buildDb({
      email_threads: [threadRow()],
      thread_memory: [pre("interest_level", "low"), pre("decision_criteria", "speed")],
    });
    groqAnswer = JSON.stringify({ facts: [
      { kind: "interest_level", value: "high", confidence: 0.9 },        // changed => supersede
      { kind: "decision_criteria", value: "speed", confidence: 0.6 },    // same => duplicate no-op
      { kind: "next_action", value: "follow up Thursday", confidence: 0.6 },
    ] });
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "hi")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    const active = api.activeFacts();
    const il = active.find((f) => f.fact_kind === "interest_level");
    const dc = active.find((f) => f.fact_kind === "decision_criteria");
    a("F: changed fact superseded (old row marked, active shows new)", r.superseded === 1 && il?.value === "high" && active.some((f) => f.id === "f-interest_level") === false, JSON.stringify(r));
    a("F2: duplicate same-kind+same-value is a no-op (no new row, no supersede)", r.duplicate === 1 && dc?.value === "speed" && acct(api, "decision_criteria") === 1);
    a("F3: new fact inserted", acct(api, "next_action") === 1);
  }

  function acct(api, kind) { return api.store.thread_memory.filter((f) => f.fact_kind === kind).length; }

  // ---------------- H. dedicated kill-switch (independent of cost conserve) ----------------
  {
    const api = buildDb({ email_threads: [threadRow()] });
    api.switchOff = true; // memory_builder.enabled = false; gate mode stays ai + budget free
    groqAnswer = '{"facts":[{"kind":"interest_level","value":"high"}]}';
    const beforeRpc = api.rpcCalls.length;
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "hello")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("H: kill-switch => conserve reason kill_switch", r.action === "conserve" && r.reason === "kill_switch", JSON.stringify(r));
    a("H2: kill-switch => NO gate call and NO debit (independent of cost conserve)", api.rpcCalls.length === beforeRpc, JSON.stringify(api.rpcCalls.map((c) => c.fn)));
    a("H3: kill-switch => no write, watermark untouched", api.store.thread_memory.length === 0 && api.store.email_threads[0].last_summarized_at == null);
    api.switchOff = false;
    const r2 = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "hello")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    a("H4: switch back on => memory writing resumes immediately", r2.action === "written" && api.store.thread_memory.length === 1, JSON.stringify(r2));
  }

  // ---------------- I. value governance: verbatim identifier echo is pruned ----------------
  {
    const SENSITIVE_MSG = "Heads up — budget is hard-capped $47,500 and the contact is (555) 017-3388 or finance@corp.test. Pricing pressure.";
    const bad = JSON.stringify({ facts: [
      { kind: "objection", value: "our budget is exactly $47,500 a 2,300,000 range total and the CEO direct line is 555-0173 or finance@corp.test pricing pressure", confidence: 0.9 },
      { kind: "interest_level", value: "very interested this Q3 2026", confidence: 0.8 },
    ] });
    const parsed = parseMemoryFacts(bad);
    const obj = parsed.find((f) => f.kind === "objection");
    const il = parsed.find((f) => f.kind === "interest_level");
    a("I: parser prunes email, phone, $ and comma-grouped figures (intent kept)",
      obj != null && !/finance@corp/i.test(obj.value) && !/0173|555/.test(obj.value) &&
      !/\$\s?47,?500/.test(obj.value) && !/47,500|2,300,000/.test(obj.value) &&
      /pricing pressure/.test(obj.value), JSON.stringify(parsed));
    a("I2: numeric day figures survive (no over-pruning of dates/legit numbers)", il?.value === "very interested this Q3 2026", JSON.stringify(parsed));
    a("I3: clean values pass through unchanged", sanitizeMemoryValue("budget-constrained, needs internal approval") === "budget-constrained, needs internal approval");
    // module-level: a BAD-model verbatim echo cannot persist identifiers to the store
    const api = buildDb({ email_threads: [threadRow()] });
    groqAnswer = bad;
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, SENSITIVE_MSG)], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    const joined = api.store.thread_memory.map((f) => f.value).join(" | ");
    a("I4: persisted row carries NO raw identifiers (email/phone/$/comma figures absent)",
      r.action === "written" && api.store.thread_memory.length === 2 &&
      !/finance@corp|0173|555[- )]|47,500|2,300,000|\$\s?47/.test(joined) && /pricing pressure/.test(joined), joined);
  }

  // ---------------- J. protected-category pattern screen (prose, no identifiers) ----------------
  {
    const cases = [
      ["my chemo schedule is on tuesdays", "my [personal] schedule is on tuesdays"],
      ["call times conflict with our prayer times", "call times conflict with our [personal] times"],
      ["needs wheelchair access for the meeting", "needs [personal] access for the meeting"],
      ["going through a divorce right now", "going through a [personal] right now"],
    ];
    a("J: protected personal-context phrases are redacted to [personal] by the sanitizer",
      cases.every(([inp, exp]) => sanitizeMemoryValue(inp) === exp),
      cases.map(([i, e]) => `${i} => ${sanitizeMemoryValue(i)}`).join(" | "));
    a("J2: none of the original protected tokens survive after sanitize",
      cases.every(([inp]) => !hasProtectedCategoryTerms(sanitizeMemoryValue(inp))));
    a("J3: business facts and industry-ambiguous words pass through untouched",
      sanitizeMemoryValue("budget for this quarter") === "budget for this quarter" &&
      sanitizeMemoryValue("hospital group procurement") === "hospital group procurement" &&
      sanitizeMemoryValue("church directory contact") === "church directory contact",
      sanitizeMemoryValue("hospital group procurement") + " | " + sanitizeMemoryValue("church directory contact"));
    // module-level: a model echoing a protected-context objection cannot persist it
    const api = buildDb({ email_threads: [threadRow()] });
    groqAnswer = '{"facts":[{"kind":"objection","value":"my chemo schedule conflicts with availability this month","confidence":0.8}]}';
    const r = await summarizeThreadMemory(api, { userId: "U", campaignId: "c", leadId: "L", plan: "starter" },
      () => [msg("m1", 1, "my chemo schedule conflicts with availability this month")], { token: "t", threadId: "gid1", senderEmail: "owner@gmail.com", groqChat: fakeGroq });
    const jv = api.store.thread_memory.map((f) => f.value).join(" | ");
    a("J4: persisted objection value carries no protected-context token (chemo redacted)",
      r.written === 1 && !/chemo/i.test(jv) && /[personal]/.test(jv), jv);
  }

  const fails = out.filter((x) => !x).length;
  console.log(`\nRESULT: ${fails === 0 ? "PASS" : "FAIL"} (${out.length - fails}/${out.length} assertions)`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });