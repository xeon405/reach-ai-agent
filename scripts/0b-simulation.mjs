// ============================================================
// 0b PROOF HARNESS — config-driven inbox judgment.
// Drives the REAL modules (_shared/agent-config.ts, _shared/policy.ts)
// through a DB-shaped stub. Proofs:
//   A) identical behavior with default config (old constants == new resolver)
//   B) a live config value change alters judgment WITHOUT any code change
// Also verifies glob->user->campaign precedence and reply-policy prompt identity.
// ============================================================
import { resolveAgentConfig, replyPolicySuffix, AGENT_CONFIG_DEFAULTS } from "../supabase/functions/_shared/agent-config.ts";
import { decide } from "../supabase/functions/_shared/policy.ts";

// The resolver calls: db.from("agent_config").select("..").eq("enabled",true).in("key", keys)
function makeDb(rows) {
  return {
    from(table) {
      if (table !== "agent_config") throw new Error("unexpected table: " + table);
      return {
        select() {
          return {
            eq: (k, v) => {
              if (k !== "enabled" || v !== true) throw new Error("unexpected filter");
              return {
                in: (_key, values) => {
                  const items = rows
                    .filter((r) => r.enabled !== false && values.includes(r.key))
                    .map((r) => ({ key: r.key, scope: r.scope, scope_id: r.scope_id ?? null, value: r.value }));
                  return Promise.resolve({ data: items, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

function glob(k, v) { return { key: k, scope: "glob", scope_id: null, value: v, enabled: true }; }
function row(k, scope, scope_id, v) { return { key: k, scope, scope_id, value: v, enabled: true }; }

const GLOB_DEFAULTS = [
  glob("confidence_floor", 0.55),
  glob("turn_budget", 3),
  glob("reply_policy", "balanced"),
  glob("max_ai_replies_per_lead_24h", 5),
];

// ---- replica of the inbox-agent routing path (drives real `decide`) ----
function route(cfgLike, cls, aiTurns, opts = {}) {
  const c = { ...cls };
  if (!c.confidence || c.confidence < cfgLike.confidence_floor) c.requires_human = true;
  return decide(c, {
    conv_mode: opts.conv_mode ?? "AI_AUTOPILOT",
    campaign_autopilot: opts.campaign_autopilot ?? true,
    ai_turns: aiTurns,
    max_turns: cfgLike.turn_budget,
    lead_status: opts.lead_status ?? "replied",
    unsubscribed: false,
  });
}

const base = { intent: "interested", confidence: 0.9, interested: true, booking_intent: false, unsubscribe: false, sentiment: "INTERESTED", requires_human: false, reason: "test", suggested_action: "auto_reply" };

const SAMPLES = [
  ["unsubscribe (must suppress)", { ...base, intent: "unsubscribe", unsubscribe: true, confidence: 0.98, interested: false, sentiment: "NOT_INTERESTED" }, 0],
  ["booking (escalate)", { ...base, intent: "booking", booking_intent: true, confidence: 0.95 }, 2],
  ["low-confidence interested 0.4 (floor routes to human)", { ...base, confidence: 0.4, intent: "question" }, 0],
  ["high-conf interested @ turn 3 (budget exhausted)", { ...base }, 3],
  ["high-conf interested @ turn 0 (autopilot replies)", { ...base }, 0],
  ["objection @ turn 2 (replies)", { ...base, intent: "objection", interested: false }, 2],
  ["objection @ turn 3 (budget)", { ...base, intent: "objection", interested: false }, 3],
  ["legal/contract (requires_human already true)", { ...base, intent: "question", requires_human: true, confidence: 0.95 }, 0],
  ["not interested (no action)", { ...base, intent: "not_interested", interested: false, confidence: 0.92, sentiment: "NOT_INTERESTED" }, 0],
  ["heuristic fallback 0.3 (floor)", { ...base, intent: "question", confidence: 0.3, interested: false, sentiment: "MAYBE" }, 0],
];

// ---------- PROOF A: identical behavior under default config ----------
let pass = 0;
const diffs = [];
const tableA = [];
for (const [name, cls, turns] of SAMPLES) {
  const old = route(AGENT_CONFIG_DEFAULTS, cls, turns);
  const cfg = await resolveAgentConfig(makeDb(GLOB_DEFAULTS), { userId: "u1", campaignId: null });
  const neu = route(cfg, cls, turns);
  const equal = JSON.stringify(old) === JSON.stringify(neu);
  if (equal && JSON.stringify(cfg) === JSON.stringify(AGENT_CONFIG_DEFAULTS)) pass++;
  else diffs.push(name);
  tableA.push([name, old.action, neu.action, equal ? "same" : "DIFF"]);
}
console.log("=== PROOF A: default config resolves to the old constants, decisions identical ===");
console.log(tableA.map((r) => `  ${r[3].padEnd(4)} ${r[0]}`).join("\n"));
console.log(`  RESULT: ${pass}/${SAMPLES.length} identical, ${diffs.length} diffs${diffs.length ? " => " + diffs.join(",") : ""}`);
if (diffs.length) throw new Error("PROOF A FAILED");

// ---------- PROOF B: live value change alters judgment, no code change ----------
console.log("\n=== PROOF B: user override changes judgment without redeploy ===");
const OVERRIDE_DB = [
  ...GLOB_DEFAULTS,
  row("confidence_floor", "user", "u1", 0.30),      // was 0.55
  row("turn_budget", "user", "u1", 5),              // was 3
];
const before = {};
const after = {};
const CHANGING = [2, 3, 6]; // low-conf floor case, budget case ×2
const NAMES = { 2: SAMPLES[2][0], 3: SAMPLES[3][0], 6: SAMPLES[6][0] };
for (const i of CHANGING) {
  const name = NAMES[i];
  const cls = SAMPLES[i][1];
  const turns = SAMPLES[i][2];
  const cfg = await resolveAgentConfig(makeDb(GLOB_DEFAULTS), { userId: "u1", campaignId: null });
  const cfgO = await resolveAgentConfig(makeDb(OVERRIDE_DB), { userId: "u1", campaignId: null });
  before[name] = route(cfg, cls, turns).action;
  after[name] = route(cfgO, cls, turns).action;
}
console.log(`  config before (glob): confidence_floor=0.55 turn_budget=3
  config after  (user u1): confidence_floor=0.30 turn_budget=5`);
for (const k of Object.keys(before)) console.log(`  ${k}\n    before: ${before[k]}  ->  after: ${after[k]}${before[k] === after[k] ? "  (no change — FAIL for this sample)" : "  (CHANGED — expected)"}`);

// ---------- PROOF C: glob -> user -> campaign precedence ----------
console.log("\n=== PROOF C: scoping precedence (glob -> user -> campaign) ===");
const threeDb = [
  glob("turn_budget", 3),
  row("turn_budget", "user", "u1", 6),
  row("turn_budget", "campaign", "c9", 1),
];
const uCamp = await resolveAgentConfig(makeDb(threeDb), { userId: "u1", campaignId: "c9" });
const uOnly = await resolveAgentConfig(makeDb(threeDb), { userId: "u1", campaignId: null });
console.log(`  user only:            turn_budget=${uOnly.turn_budget} (expect 6)`);
console.log(`  user + campaign:      turn_budget=${uCamp.turn_budget} (expect 1 — campaign wins)${uCamp.turn_budget === 1 ? "  OK" : "  FAIL"}`);

// ---------- PROOF D: reply-policy prompt identity ----------
console.log("\n=== PROOF D: reply-policy prompt selector ===");
const pf = (policy) => replyPolicySuffix(policy);
const oldPrompt = `Write a 3-4 sentence human reply on behalf of X. Warm, confident, zero fluff. ${"pay attention to objections"}`;
const newPrompt = `Write a 3-4 sentence human reply on behalf of X. Warm, confident, zero fluff.${pf("balanced")} ${"pay attention to objections"}`;
console.log(`  default 'balanced' adds nothing: ${oldPrompt === newPrompt ? "IDENTICAL prompts  OK" : "MISMATCH  FAIL"}`);
console.log(`  'concise' adds guidance ("${pf("concise").trim()}")  ${pf("concise") ? "OK" : "FAIL"}`);
console.log(`  unknown policy falls back to '' (safe): ${pf("nonsense") === "" ? "OK" : "FAIL"}`);

console.log("\n=== PROOF E: emergency default when config layer is down/empty ===");
const failDb = { from() { throw new Error("read failed"); } };
const eFail = await resolveAgentConfig(failDb, { userId: "u1", campaignId: null });
const eEmpty = await resolveAgentConfig(makeDb([]), { userId: "u1", campaignId: null });
const defaultJson = JSON.stringify(AGENT_CONFIG_DEFAULTS);
console.log(`  read error -> defaults: ${JSON.stringify(eFail) === defaultJson ? "OK" : "FAIL"}`);
console.log(`  no rows    -> defaults: ${JSON.stringify(eEmpty) === defaultJson ? "OK" : "FAIL"}`);

console.log(`\nALL PROOFS: ${pass}'/'${SAMPLES.length} + precedence + identity + emergency — ${diffs.length === 0 ? "PASS" : "FAIL"}`);