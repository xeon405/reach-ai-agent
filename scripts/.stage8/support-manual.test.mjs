// The support manual is the single source of fact for both the fast answers and
// the AI prompt. These tests protect the two ways it can quietly go wrong:
//   1. a trimmed prompt drops a section a mixed question needs, and
//   2. the text drifts back to a button, page or number that no longer exists.
//
// Run: node scripts/.stage8/support-manual.test.mjs
import { SUPPORT_MANUAL, buildSupportManual } from "../../supabase/functions/_shared/support-manual.ts";
import { supportTopicHits, ensureBillingFacts } from "../../supabase/functions/_shared/support-topics.ts";
import { fastSupportAnswer } from "../../supabase/functions/_shared/support-fast.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const hits = (text) => supportTopicHits(text);
const has = (topics, text) => buildSupportManual(topics).includes(text);

// ---- multi-topic questions return every topic, never only the first ------
{
  const h = hits("my campaign is not sending");
  check(h.includes("CAMPAIGNS"), "campaign + sending finds CAMPAIGNS", h.join(","));
  check(h.includes("EMAILS"), "campaign + sending finds EMAILS", h.join(","));
}
{
  const h = hits("how do follow ups work in my campaign");
  check(h.includes("FOLLOWUPS") && h.includes("CAMPAIGNS"), "follow-ups inside a campaign finds both", h.join(","));
}
{
  const h = hits("can you find emails of parents");
  check(h.length === 1 && h[0] === "PERSONAL_DATA", "personal contact data stays a hard boundary", h.join(","));
}

// ---- single-topic questions still route exactly -------------------------
for (const [text, want] of [
  ["what does outship do", "OVERVIEW"],
  ["hi", "SOCIAL"],
  ["why am i here", "WELCOME"],
  ["who built this", "IDENTITY"],
  ["how do i connect gmail", "GMAIL"],
  ["how to get leads", "LEAD_FINDING"],
  ["how do follow ups work", "FOLLOWUPS"],
  ["how much is starter plan", "BILLING"],
  ["how much does growth cost", "BILLING"],
  ["how much is agency", "BILLING"],
  ["كم سعر خطة جروث", "BILLING"],
  ["where do i see replies", "REPLIES"],
  ["email going to spam", "EMAILS"],
  ["how do i start", "GETTING_STARTED"],
  ["delete my account", "DATA_PRIVACY"],
  ["recommend a school name", "OFF_TOPIC"],
  ["how much time does it take", "UNKNOWN"],
  ["what is the capital of france", "UNKNOWN"],
]) {
  const h = hits(text);
  check(h.length === 1 && h[0] === want, `routes: ${text}`, h.join(","));
}

// ---- a trimmed prompt is always smaller than the full manual ------------
const KNOWN = [
  "WELCOME", "IDENTITY", "SOCIAL", "OVERVIEW", "GMAIL", "LEAD_FINDING",
  "CAMPAIGNS", "REPLIES", "FOLLOWUPS", "BILLING", "EMAILS", "GETTING_STARTED",
  "DATA_PRIVACY",
];
for (const topic of KNOWN) {
  const text = buildSupportManual([topic]);
  check(text.length < SUPPORT_MANUAL.length, `${topic} trims the prompt`, `${text.length} < ${SUPPORT_MANUAL.length}`);
  check(text.includes("## MONEY RULES"), `${topic} keeps the money rules`, "");
  check(text.includes("### Support"), `${topic} keeps the support email`, "");
}

// ---- the union has both halves and nothing from unrelated billing -------
{
  const text = buildSupportManual(["CAMPAIGNS", "EMAILS"]);
  check(text.includes("### Campaigns (/campaigns)"), "union keeps the campaign section");
  check(text.includes("### Sending Issues"), "union keeps the sending section");
  check(!text.includes("### Billing (/billing)"), "union does not drag in billing");
  check(text.includes("## SCOPE NOTE"), "trimmed prompt says what to do when unsure");
}

// ---- unknown topics, off-topic and personal data get the FULL manual ----
for (const topic of ["OFF_TOPIC", "PERSONAL_DATA", "UNKNOWN", "NOT_A_REAL_TOPIC"]) {
  check(buildSupportManual([topic]) === SUPPORT_MANUAL, `${topic} falls back to the full manual`);
}
check(buildSupportManual([]) !== SUPPORT_MANUAL, "no topic still builds the always-on blocks");

// ---- the facts themselves: no stale button, page, schedule or wording ---
const STALE = [
  "14-step",
  "14 AI follow-ups",
  "AI Write",
  "Save to Database",
  "Step 3/14",
  "warm-up",
  "### Leads (/leads)",
  "Lead Finder → niche + country → Search",
  "Downgrades apply",
  "period you paid for",
  "added to all outgoing emails",
  "Danger Zone → Delete Account",
  "Get Starter — $37/mo",
];
for (const phrase of STALE) {
  check(!SUPPORT_MANUAL.includes(phrase), `manual has no stale text: ${phrase}`);
}
for (const fact of [
  "50 emails total",
  "day 3, 7, 14 and 21",
  "Contacts → Find Leads with AI",
  "Add to Campaign",
  "Review → Preview",
  "gradual send ramp with automatic brakes",
  "outshipai@gmail.com",
  "Paid checkout is currently closed",
]) {
  check(SUPPORT_MANUAL.includes(fact), `manual states the real fact: ${fact}`);
}

// ---- every fast answer is shorter than the thing it replaces ------------
for (const q of [
  "what does outship do", "how to get leads", "how do i start",
  "how do follow ups work", "how do i connect gmail",
]) {
  const a = fastSupportAnswer(q);
  check(!!a && a.reply.length < 600, `fast answer is short: ${q}`, a ? String(a.reply.length) : "null");
}

// ---- a pricing answer can never omit one-time or closed checkout ---------
{
  const both = "Growth is $79 one-time. Paid checkout is currently closed.";
  check(ensureBillingFacts(both, ["BILLING"], false) === both, "billing facts: a complete answer is untouched");

  const noClosed = "Growth is $79 one\u2011time and includes 200 emails a day.";
  const fixedClosed = ensureBillingFacts(noClosed, ["BILLING"], false);
  check(fixedClosed.includes("Paid checkout is currently closed"), "billing facts: missing closed checkout is added");
  check(fixedClosed.startsWith(noClosed), "billing facts: the model's words are not rewritten");

  const noOneTime = "Growth is $79. Checkout is currently closed while payments are verified.";
  const fixedOneTime = ensureBillingFacts(noOneTime, ["BILLING"], false);
  check(/one-time and never auto-renews/.test(fixedOneTime), "billing facts: missing one-time is added");
  check(fixedOneTime.includes("Checkout is currently closed"), "billing facts: existing closed fact is kept");

  const neither = "Growth is $79 with 200 emails a day.";
  const fixedBoth = ensureBillingFacts(neither, ["BILLING"], false);
  check(fixedBoth.includes("one-time and never auto-renews") && fixedBoth.includes("Paid checkout is currently closed"), "billing facts: both missing facts are added");

  check(ensureBillingFacts(fixedBoth, ["BILLING"], false) === fixedBoth, "billing facts: a second pass adds nothing");

  const other = "Connect Gmail from Settings.";
  check(ensureBillingFacts(other, ["GMAIL"], false) === other, "billing facts: other topics are untouched");

  const arabic = "خطة جروث 79 دولاراً.";
  const fixedArabic = ensureBillingFacts(arabic, ["BILLING"], true);
  check(fixedArabic.includes("مرة واحدة") && fixedArabic.includes("مغلق"), "billing facts: Arabic answer gets Arabic facts");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
