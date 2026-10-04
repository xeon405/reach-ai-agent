// Tests for the new understanding layer.
//
// The parser is the trust boundary: whatever the model returns, only a real
// goal with sanitised params may reach the executor. These are the adversarial
// cases - a model that invents an intent, upgrades a read into a write, or
// returns a slot nobody asked for.
//
// Run: node scripts/.stage8/agent-understand.test.mjs
import { parseUnderstanding } from "../../supabase/functions/_shared/agent-understand.ts";
import { isWriteIntent, missingSlots, isPlaceholderSlot, GOAL_BY_INTENT } from "../../supabase/functions/_shared/agent-capabilities.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const P = (s) => parseUnderstanding(s);

// ---- the thing that started all this: conversation needs no intent -------
{
  const r = P(JSON.stringify({ kind: "chat", reply: "I can list your campaigns, find contacts, and check your sending numbers. Nothing sends without your OK." }));
  check(r?.u?.kind === "chat", "a pure question about the assistant is CHAT, not a command", r?.u?.kind);
  check(r?.u?.kind === "chat" && r.u.reply.length > 10, "and it carries a real reply");
  check(r?.cachedIntent === null, "chat never caches an intent");
}
{
  const r = P(JSON.stringify({ kind: "chat", reply: "Cold email reply rates of 2-5% are normal for a first campaign." }));
  check(r?.u?.kind === "chat", "general advice is CHAT");
}

// ---- goals ---------------------------------------------------------------
{
  const r = P(JSON.stringify({ kind: "read", intent: "campaign_stats", params: {} }));
  check(r?.u?.kind === "read" && r.u.req.intent === "campaign_stats", "a read goal is accepted");
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "find_contacts", params: { city: "Dubai", limit: 25 } }));
  check(r?.u?.kind === "read", "read with params accepted");
  check(r?.u?.req?.params?.city === "Dubai", "city preserved");
  check(r?.u?.req?.params?.limit === 25, "limit is numeric");
}
{
  const r = P(JSON.stringify({ kind: "write", intent: "pause_campaign", params: { campaignName: "Spring Sale" }, summary: "Pause Spring Sale" }));
  check(r?.u?.kind === "write", "a write goal is marked write");
  check(r?.u?.kind === "write" && isWriteIntent(r.u.req.intent), "and it really is a write goal");
  check(r?.cachedIntent === "pause_campaign", "a write phrase is learnable");
}

// ---- refusal: a goal that does not exist -------------------------------
{
  const r = P(JSON.stringify({ kind: "read", intent: "send_all_emails", params: {} }));
  check(r === null, "an INVENTED intent is discarded entirely", JSON.stringify(r?.u?.kind));
}
{
  const r = P(JSON.stringify({ kind: "write", intent: "drop_database", params: {} }));
  check(r === null, "an invented destructive intent is discarded");
}
{
  const r = P("not json at all");
  check(r === null, "unparseable output is discarded");
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "", params: {} }));
  check(r === null, "an empty intent is discarded");
}

// ---- refusal: mislabelled write ----------------------------------------
{
  // The model claiming a write is a read must not make it safe to run.
  const r = P(JSON.stringify({ kind: "read", intent: "pause_campaign", params: { campaignName: "X" } }));
  check(r?.u?.kind === "write", "a write intent is still a write even if labelled read", r?.u?.kind);
}

// ---- missing slots become questions, never guesses ---------------------
{
  const r = P(JSON.stringify({ kind: "read", intent: "create_campaign_draft", params: {} }));
  check(r?.u?.kind === "ask", "create_campaign_draft with no name asks", r?.u?.kind);
  check(r?.u?.kind === "ask" && /call/i.test(r.u.question), "and asks for the name", r?.u?.kind === "ask" ? r.u.question : "");
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "add_contacts_to_campaign", params: { city: "Dubai" } }));
  check(r?.u?.kind === "ask", "add_contacts with no campaign name asks");
}
{
  const r = P(JSON.stringify({ kind: "write", intent: "create_campaign_draft", params: { campaignName: "Spring Sale" } }));
  check(r?.u?.kind === "write", "with the name filled in it becomes a write");
}
{
  const slots = missingSlots(GOAL_BY_INTENT.get("create_campaign_draft"), {});
  check(slots.includes("campaignName"), "missingSlots reports the gap");
  check(missingSlots(GOAL_BY_INTENT.get("campaign_stats"), {}).length === 0, "a goal with no needs reports no gaps");
}

// ---- ambiguity ---------------------------------------------------------
{
  const r = P(JSON.stringify({ kind: "unclear", question: "Did you mean listing your campaigns, or the numbers?" }));
  check(r?.u?.kind === "unclear", "ambiguity becomes a question");
  check(r?.u?.kind === "unclear" && /did you mean/i.test(r.u.question), "and it offers the options");
}
{
  const r = P(JSON.stringify({ kind: "unclear" }));
  check(r?.u?.kind === "unclear" && r.u.question.length > 5, "unclear with no question still says something useful");
}

// ---- param hygiene -----------------------------------------------------
{
  const r = P(JSON.stringify({ kind: "read", intent: "find_contacts", params: { limit: 99999, city: "  Dubai  " } }));
  check(r?.u?.req?.params?.limit === 200, "an absurd limit is clamped", String(r?.u?.req?.params?.limit));
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "find_contacts", params: { user_id: "someone-else", id: "drop table" } }));
  check(r?.u?.req?.params?.user_id === undefined, "unknown params are stripped");
  check(r?.u?.req?.params?.id === undefined, "even an injection-looking one");
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "find_contacts", params: { city: "x".repeat(500) } }));
  check((r?.u?.req?.params?.city?.length ?? 0) <= 120, "an over-long param is truncated");
}
{
  const r = P(JSON.stringify({ kind: "read", intent: "find_contacts", params: { limit: "many" } }));
  check(r?.u?.req?.params?.limit === undefined, "a non-numeric limit is dropped, not coerced to NaN");
}

// ---- a clarifying question survives a forgotten intent ------------------
{
  const r = P(JSON.stringify({ kind: "ask", question: "What should I call the new campaign?" }));
  check(r?.u?.kind === "unclear", "an ask with no intent still answers instead of vanishing", r?.u?.kind);
  check(r?.u?.kind === "unclear" && /call the new campaign/i.test(r.u.question), "and keeps the question", r?.u?.kind === "unclear" ? r.u.question : "");
}
{
  const r = P(JSON.stringify({ kind: "ask", intent: "create_campaign_draft", params: {}, question: "What should I call it?" }));
  check(r?.u?.kind === "ask" && r.u.intent === "create_campaign_draft", "an ask WITH an intent keeps the intent", r?.u?.kind);
}
{
  const r = P(JSON.stringify({ kind: "unclear", guess: "not_a_real_intent", question: "Which one?" }));
  check(r?.u?.kind === "unclear" && r.u.guess === undefined, "a bad guess is stripped, the question survives", String(r?.u?.guess));
}

// ---- every declared goal is reachable and consistent -------------------
{
  const bad = [];
  for (const g of (await import("../../supabase/functions/_shared/agent-capabilities.ts")).GOALS) {
    const need = g.needs.length ? {} : {};
    const r = P(JSON.stringify({ kind: g.write ? "write" : "read", intent: g.intent, params: need }));
    if (!r?.u) bad.push(g.intent);
  }
  check(bad.length === 0, "every declared goal parses without a name supplied", bad.join(","));
}
{
  const { GOALS } = await import("../../supabase/functions/_shared/agent-capabilities.ts");
  check(GOALS.every((g) => g.examples.length >= 3), "every goal carries several example phrasings");
  check(GOALS.some((g) => g.write) && GOALS.some((g) => !g.write), "the goal set mixes reads and writes");
}

// ---- placeholder slots are NOT filled slots -------------------------------
// The model sometimes copies a placeholder verbatim as the value, which then
// passes the empty check and fails a literal database search. "add my London
// dentists to a campaign" became campaignName:"a campaign".
{
  const ask = (msg, params) =>
    parseUnderstanding(`{"kind":"goal","intent":"add_contacts_to_campaign","params":${JSON.stringify(params)},"summary":"test"}`, msg);

  check(ask("add my London dentists to a campaign", { city: "London", campaignName: "a campaign" }).u.kind === "ask",
    'campaignName "a campaign" counts as missing');
  check(ask("add them", { campaignName: "my campaign" }).u.kind === "ask",
    'campaignName "my campaign" counts as missing');
  check(ask("add them", { campaignName: "Spring Sale" }).u.kind === "write", "a real name is still filled");
  check(ask("add them", { campaignName: "my campaign 2024" }).u.kind === "write", "a partly-real name survives");
  check(isPlaceholderSlot("campaignName", "a campaign") === true, '"a campaign" is flagged as a placeholder');
  check(isPlaceholderSlot("campaignName", "Spring Sale") === false, '"Spring Sale" is not a placeholder');
}

// ---- the ASK branch must backfill too --------------------------------------
// The model usually asks its own clarifying question, and that branch used to
// skip backfill - so "add my London dentists to a campaign" was saved with no
// city and the follow-up "Spring Sale" lost the original request entirely.
{
  const ask = parseUnderstanding(
    '{"kind":"ask","intent":"add_contacts_to_campaign","question":"Which campaign?","params":{"campaignName":"a campaign","category":"dentists"}}',
    "add my London dentists to a campaign",
  );
  check(ask.u.params.city === "London", "ask branch keeps the city the model dropped", JSON.stringify(ask.u.params));
  check(ask.cachedParams.city === "London", "ask branch caches the backfilled params", JSON.stringify(ask.cachedParams));
  check(/campaign/i.test(ask.u.question), "ask branch still asks about the campaign", ask.u.question);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILURES:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("NO FAILURES");
