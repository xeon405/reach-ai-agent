// Simulation proof for the support-chat AI-cost gate wiring (§6.3).
// Imports the EXACT module shipped to production (_shared/ai-cost-gate.ts) so the
// proof exercises the real decision code — guest bucket resolve/debit/settle
// contract, glob marker precedence, stale-unknown conservation, per-user pools
// for logged-in chat, and the emergency gate_enabled bypass. The meter-side
// settle (groq.ts recordMeter) is exercised via the context contract (reserve +
// guest flags the meter reconciles with) and covered end-to-end in the live proof.
import { randomUUID } from "node:crypto";

// ai-cost-gate.ts reads its rates/pools from Deno.env at import time; stub Deno
// BEFORE the dynamic import so the module's defaults are in force.
(globalThis as any).Deno = { env: { get: () => undefined } };
const gate = await import("../../supabase/functions/_shared/ai-cost-gate.ts");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

// ---- mock structural db (same shape ai-cost-gate uses: from().select().in()/.eq()..maybeSingle, rpc) ----
type CfgRow = { key: string; scope: string; scope_id: string | null; value: unknown; enabled: boolean };
type UserState = { profile_id: string; used_daily_usd: number; used_monthly_usd: number; last_reported_at: string | null };

class MockDb {
  agent_config: CfgRow[] = [];
  ai_cost_guest_state: Array<{ id: true; used_daily_usd: number; last_reported_at: string | null }> = [];
  ai_cost_state: Array<UserState> = [];
  debitResults: null | { ok: boolean; reason?: string } = null; // ai_cost_guest_debit
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  groqCalls: Array<Record<string, unknown>> = [];

  from(table: string) {
    const self = this;
    const filters: Array<{ k: string; v?: unknown; vs?: unknown[]; op: "eq" | "in" }> = [];
    const compute = () => {
      let rows: any[] = (self as any)[table] ?? [];
      for (const f of filters) {
        rows = rows.filter((r: any) =>
          f.op === "eq" ? r[f.k] === f.v : (f.vs as unknown[]).includes(r[f.k]),
        );
      }
      return rows;
    };
    const q: any = {
      select(..._a: unknown[]) {
        return q;
      },
      in(k: string, vs: unknown[]) {
        filters.push({ k, vs, op: "in" });
        return q;
      },
      eq(k: string, v: unknown) {
        filters.push({ k, v, op: "eq" });
        return q;
      },
      async maybeSingle() {
        return Promise.resolve({ data: compute()[0] ?? null });
      },
      // supabase-js builders are thenable: `await from(t).select()...` resolves
      // to { data: rows[] } (a LIST). readConfig uses exactly this form.
      then(resolve: (v: { data: any[] }) => unknown) {
        return Promise.resolve({ data: compute() }).then(resolve);
      },
    };
    return q;
  }
  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    if (fn === "ai_cost_guest_debit") {
      const r = this.debitResults ?? { ok: true };
      return Promise.resolve({ data: r });
    }
    if (fn === "ai_cost_debit") {
      const st = this.ai_cost_state.find((r) => r.profile_id === String(args.p_profile_id));
      const usedDaily = st?.used_daily_usd ?? 0;
      const pools = gate.aiPools(String(args.p_plan ?? "starter"));
      const ok = usedDaily + Number(args.p_debit) <= pools.daily;
      return Promise.resolve({ data: { ok, reason: ok ? null : "ceiling" } });
    }
    return Promise.resolve({ data: { ok: true } });
  }
}

function groqChatStub(db: MockDb) {
  return async (msgs: Array<{ role: string; content: string }>, opts?: any) => {
    db.groqCalls.push({ msgs, opts });
    return "REPLY-FROM-STUB";
  };
}

const poolDaily = gate.AI_GUEST_POOL_DAILY;
const userId = randomUUID();

console.log("BLOCK A — guest bucket (openGuestAiCall)");
{
  // A1 fresh bucket, no markers -> AI; run settles contract (debit + groq ctx guest/reserve)
  {
    const db = new MockDb();
    const handle = await gate.openGuestAiCall(db, { kind: "chat", fn: "support-chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai", "A1a fresh guest bucket => mode ai");
    const out = await handle.run("Hi there! How do I get started?", { maxTokens: 900, temperature: 0.3 });
    assert(out === "REPLY-FROM-STUB", "A1b run() returns the LLM text");
    const debit = db.rpcCalls.find((r) => r.fn === "ai_cost_guest_debit");
    assert(!!debit && Number(debit.args.p_debit) > 0, "A1c reserve debited before the call");
    assert(debit!.args.p_pool_daily === poolDaily, "A1d daily pool passed to the RPC");
    const groqCtx = db.groqCalls[0]?.opts?.context;
    assert(groqCtx?.guest === true && Number(groqCtx?.reserve) > 0, "A1e meter settle contract: guest + reserve present");
    assert(groqCtx?.fn === "support-chat" && groqCtx?.kind === "chat", "A1f attribution rides the meter context");
  }
  // A2 bucket already at the daily pool -> template; run null; NO groq
  {
    const db = new MockDb();
    db.ai_cost_guest_state = [{ id: true, used_daily_usd: poolDaily, last_reported_at: new Date().toISOString() }];
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "template", "A2a daily pool reached => template (concede guest_daily_pool)");
    assert(handle.reason === "guest_daily_pool", "A2b reason explicit");
    const out = await handle.run("anything");
    assert(out === null && db.groqCalls.length === 0, "A2c no LLM on refusal");
  }
  // A3 glob template marker wins
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.mode", scope: "glob", scope_id: null, value: "template", enabled: true });
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "template" && handle.reason === "admin:template", "A3 glob template => template");
  }
  // A4 glob hard_stop marker wins
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.mode", scope: "glob", scope_id: null, value: "hard_stop", enabled: true });
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "hard_stop", "A4 glob hard_stop => hard_stop");
  }
  // A5 stale-unknown conservation: spent bucket, heartbeat > AI_METER_MAX_AGE_MS
  {
    const db = new MockDb();
    db.ai_cost_guest_state = [{ id: true, used_daily_usd: 0.001, last_reported_at: new Date(Date.now() - 25 * 60 * 1000).toISOString() }];
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "template" && handle.reason === "metering_degraded", "A5 spent-unknown bucket conserves");
  }
  // A6 emergency bypass: glob gate_enabled=false -> straight to groq, no debit
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.gate_enabled", scope: "glob", scope_id: null, value: false, enabled: true });
    const handle = await gate.openGuestAiCall(db, { kind: "chat", fn: "support-chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai" && handle.reason === "gate_disabled", "A6a gate_enabled=false bypasses the gate");
    const out = await handle.run("hi", { maxTokens: 900 });
    assert(out === "REPLY-FROM-STUB", "A6b bypass still answers");
    assert(!db.rpcCalls.some((r) => r.fn === "ai_cost_guest_debit"), "A6c no debit in bypass path");
  }
  // A7 debit refused at run-time (ceiling won mid-flight) -> run null, no groq
  {
    const db = new MockDb();
    db.debitResults = { ok: false, reason: "ceiling" };
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai", "A7a mode resolved ai (state under pool)");
    const out = await handle.run("hi", { maxTokens: 900 });
    assert(out === null && db.groqCalls.length === 0, "A7b refused debit => no LLM");
  }
  // A8 per-call guard: over the 0.0025 bound -> run null BEFORE any debit
  {
    const db = new MockDb();
    const handle = await gate.openGuestAiCall(db, { kind: "chat", groqChat: groqChatStub(db) }, 999999);
    const out = await handle.run("x".repeat(60000), { maxTokens: 999999 });
    assert(out === null && db.rpcCalls.length === 0, "A8 oversized reserve => template, no debit");
  }
}

console.log("BLOCK B — logged-in chat (openAiCall, kind 'chat')");
{
  // B1 fresh user, no counter row -> ai
  {
    const db = new MockDb();
    const handle = await gate.openAiCall(db, { userId, kind: "chat", fn: "support-chat", plan: "starter", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai", "B1a fresh user => ai (no_state)");
    const out = await handle.run("Hi", { maxTokens: 900 });
    assert(out === "REPLY-FROM-STUB", "B1b answers through the per-user gate");
    const debit = db.rpcCalls.find((r) => r.fn === "ai_cost_debit");
    assert(!!debit && debit.args.p_profile_id === userId, "B1c debits the user's durable counter");
  }
  // B2 daily USD pool reached -> template (chat is a non-reply kind: L1 daily check applies)
  {
    const db = new MockDb();
    const pools = gate.aiPools("starter");
    db.ai_cost_state.push({ profile_id: userId, used_daily_usd: pools.daily, used_monthly_usd: 0, last_reported_at: new Date().toISOString() });
    const handle = await gate.openAiCall(db, { userId, kind: "chat", fn: "support-chat", plan: "starter", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "template", "B2 daily pool reached => template");
    assert((await handle.run("x")) === null, "B2b no LLM past the pool");
  }
  // B3 monthly pool reached -> hard_stop
  {
    const db = new MockDb();
    const pools = gate.aiPools("growth");
    db.ai_cost_state.push({ profile_id: userId, used_daily_usd: 0, used_monthly_usd: pools.monthly, last_reported_at: new Date().toISOString() });
    const handle = await gate.openAiCall(db, { userId, kind: "chat", fn: "support-chat", plan: "growth", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "hard_stop", "B3 monthly pool => hard_stop");
  }
  // B4 user metering_degraded marker -> template
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.metering_degraded", scope: "user", scope_id: userId, value: true, enabled: true });
    const handle = await gate.openAiCall(db, { userId, kind: "chat", plan: "starter", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "template" && handle.reason === "metering_degraded", "B4 degraded marker conserves");
  }
  // B5 user bypass -> ai, no debit
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.gate_enabled", scope: "user", scope_id: userId, value: false, enabled: true });
    const handle = await gate.openAiCall(db, { userId, kind: "chat", plan: "starter", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai" && handle.reason === "gate_disabled", "B5 user gate_enabled=false bypasses");
  }
  // B6 most-specific wins: glob=template but user=ai -> user wins (ai)
  {
    const db = new MockDb();
    db.agent_config.push({ key: "ai_quality.mode", scope: "glob", scope_id: null, value: "template", enabled: true });
    db.agent_config.push({ key: "ai_quality.mode", scope: "user", scope_id: userId, value: "ai", enabled: true });
    const handle = await gate.openAiCall(db, { userId, kind: "chat", plan: "starter", groqChat: groqChatStub(db) }, 900);
    assert(handle.mode === "ai", "B6 user-level 'ai' overrides a glob template");
  }
}

console.log("BLOCK C — math sanity");
{
  assert(gate.reserveEstimate(200, 900) > 0 && gate.reserveEstimate(200, 900) <= gate.AI_PER_CALL_GUARD, "C1 chat-size reserve fits the per-call guard");
  assert(poolDaily > 0 && poolDaily * 30 === gate.AI_GUEST_POOL_MONTHLY, "C2 guest monthly = 30x daily");
  assert(gate.aiPools("starter").daily > gate.aiPools("free").daily, "C3 plan pools still monotonic");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("failures:", failures);
  process.exit(1);
}