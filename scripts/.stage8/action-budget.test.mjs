// Tests the REAL supabase/functions/_shared/action-budget.ts (Node 24 strips the
// types natively). No hand-rolled port, so this cannot drift from the source.
// Run: node scripts/.stage8/action-budget.test.mjs
import {
  DEFAULT_ACTION_CAPS,
  PLAN_ACTION_CAPS,
  actionCaps,
  beginMessage,
  budgetPrompt,
  consumeAction,
  emptyActionState,
  readActionState,
  requestAction,
  writeActionState,
} from "../../supabase/functions/_shared/action-budget.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

// ---- plan caps -----------------------------------------------------------
check(actionCaps("agency").perMessage === 12, "agency cap is 12/message");
check(actionCaps("free").perConversation === 8, "free cap is 8/conversation");
check(
  actionCaps("nonsense").perMessage === DEFAULT_ACTION_CAPS.perMessage,
  "unknown plan falls back to free, not the most generous",
);
check(actionCaps(null).perMessage === DEFAULT_ACTION_CAPS.perMessage, "null plan falls back to free");
check(actionCaps("GROWTH").perMessage === 8, "plan lookup is case-insensitive");

// ---- per-message cap trips, conversation keeps counting ------------------
{
  let s = beginMessage(emptyActionState(), "m1");
  const plan = "free"; // 3 per message
  let last = null;
  for (let i = 0; i < 3; i++) last = consumeAction(s, plan), (s = last.state);
  check(last.allowed === true, "third action of 3 is allowed", `used=${last.used.inMessage}`);

  const denied = consumeAction(s, plan);
  check(denied.allowed === false, "fourth action in the same message is denied");
  check(denied.reason === "message_cap", "denial reason is message_cap", denied.reason);
  check(denied.state.usedInMessage === 3, "a denied action does NOT increment the counter");
  check(denied.remaining.inMessage === 0, "remaining in message is 0");
}

// ---- a new message resets only the per-message counter -------------------
{
  const s1 = { messageId: "m1", usedInMessage: 3, usedInConversation: 3 };
  const s2 = beginMessage(s1, "m2");
  check(s2.usedInMessage === 0, "new message resets the per-message counter");
  check(s2.usedInConversation === 3, "new message KEEPS the conversation counter");

  const same = beginMessage(s1, "m1");
  check(same === s1, "same message id is a no-op (no reset mid-message)");
}

// ---- per-conversation cap trips across messages --------------------------
{
  let s = emptyActionState();
  // free = 3/message, 8/conversation -> 3 + 3 + 2 then the 9th is denied
  for (const m of ["m1", "m2"]) {
    for (let i = 0; i < 3; i++) s = consumeAction(beginMessage(s, m), "free").state;
  }
  s = beginMessage(s, "m3");
  s = consumeAction(s, "free").state;
  s = consumeAction(s, "free").state;
  const denied = consumeAction(s, "free");
  check(denied.allowed === false, "9th action in the conversation is denied");
  check(denied.reason === "conversation_cap", "denial reason is conversation_cap", denied.reason);
  check(denied.used.inConversation === 8, "conversation counter reached 8", String(denied.used.inConversation));
}

// ---- the message cap is checked FIRST (better error for the user) --------
{
  const s = { messageId: "m", usedInMessage: 99, usedInConversation: 99 };
  const d = consumeAction(s, "free");
  check(d.reason === "message_cap", "message_cap reported before conversation_cap", d.reason);
}

// ---- kill switch ---------------------------------------------------------
{
  const s = emptyActionState();
  const d = consumeAction(s, "agency", true);
  check(d.allowed === false, "disabled gate refuses every action");
  check(d.reason === "disabled", "reason is disabled", d.reason);
  check(d.state.usedInMessage === 0, "a disabled gate burns no budget");
}

// ---- the stop-and-ask prompt --------------------------------------------
{
  const s = { messageId: "m", usedInMessage: 3, usedInConversation: 3 };
  const msg = budgetPrompt(consumeAction(s, "free"));
  check(/limit 3/.test(msg), "prompt states the cap", JSON.stringify(msg));
  check(/continue/i.test(msg), "prompt asks the user to continue");
  check(budgetPrompt(consumeAction(emptyActionState(), "free")) === "", "no prompt when allowed");
}

// ---- persistence: fail-CLOSED on an unreadable / unwritable counter ------
{
  const broken = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error("table missing"); } }) }),
    }),
  };
  const d = await requestAction(broken, { conversationId: "c1", messageId: "m1", plan: "growth" });
  check(d.allowed === false, "unreadable counter REFUSES the action (fail-closed)");
  check(d.reason === "message_cap", "fail-closed reports message_cap", d.reason);
}

{
  // readable, but the write fails -> must also refuse, never run unrecorded
  const halfBroken = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: { message: "denied" } }),
    }),
  };
  const d = await requestAction(halfBroken, { conversationId: "c1", messageId: "m1", plan: "growth" });
  check(d.allowed === false, "unwritable counter REFUSES the action (never run unrecorded)");
}

{
  // a throwing db object must not throw out of the limiter
  const nasty = {
    from: () => {
      throw new Error("network down");
    },
  };
  const d = await requestAction(nasty, { conversationId: "c1", messageId: "m1", plan: "growth" });
  check(d.allowed === false, "a throwing db is contained, not propagated");
}

// ---- persistence: happy path round-trip with a fake db -------------------
{
  const rows = new Map();
  const fake = {
    from: (t) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const r = rows.get("c2");
            return { data: r ?? null, error: null };
          },
        }),
      }),
      upsert: async (row) => {
        rows.set("c2", row);
        return { error: null };
      },
    }),
  };

  const d1 = await requestAction(fake, { conversationId: "c2", messageId: "mA", plan: "free" });
  check(d1.allowed === true, "first action allowed via requestAction", d1.reason);
  check(d1.used.inConversation === 0 && rows.get("c2").used_in_conversation === 1,
    "counter persists the used action");

  const d2 = await requestAction(fake, { conversationId: "c2", messageId: "mA", plan: "free" });
  check(d2.used.inConversation === 1, "second call sees the persisted counter", String(d2.used.inConversation));

  // new message in the same conversation: per-message resets, per-conversation does not
  const d3 = await requestAction(fake, { conversationId: "c2", messageId: "mB", plan: "free" });
  check(d3.used.inMessage === 0, "new message resets per-message in the db path");
  check(d3.used.inConversation === 2, "per-conversation keeps climbing in the db path");
}

// ---- readActionState normalises junk ------------------------------------
{
  const junk = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { message_id: null, used_in_message: "x", used_in_conversation: null }, error: null }) }),
      }),
    }),
  };
  const { state, readable } = await readActionState(junk, "c3");
  check(readable === true, "junk row still counts as readable");
  check(state.usedInMessage === 0 && state.usedInConversation === 0, "junk counters normalise to 0");
}

// ---- every plan's caps are ordered sensibly -----------------------------
{
  const plans = ["free", "starter", "growth", "agency"];
  let ok = true;
  for (let i = 1; i < plans.length; i++) {
    const prev = PLAN_ACTION_CAPS[plans[i - 1]];
    const cur = PLAN_ACTION_CAPS[plans[i]];
    if (cur.perMessage < prev.perMessage || cur.perConversation < prev.perConversation) ok = false;
  }
  check(ok, "caps increase monotonically from free -> agency");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
