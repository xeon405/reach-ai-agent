// Support fast lane: the tests that matter are the refusals. A known question
// must answer without the model; anything mixed, money-related, account-specific,
// Arabic, or even slightly unknown must return null so the AI handles it.
//
// Run: node scripts/.stage8/support-fast.test.mjs
import { fastSupportAnswer, fastTopicForReply } from "../../supabase/functions/_shared/support-fast.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const topic = (text) => fastSupportAnswer(text)?.topic ?? null;
const refuses = (text) => {
  const got = topic(text);
  check(got === null, `refuses: ${text}`, got ? `answered ${got}` : "");
};

// ---- the real top questions from stored support messages ----------------
for (const [text, want] of [
  ["hi", "GREETING"],
  ["hello", "GREETING"],
  ["what does outship do", "OVERVIEW"],
  ["what does outshipai do", "OVERVIEW"],
  ["how to get leads", "LEAD_FINDING"],
  ["how do i find leads", "LEAD_FINDING"],
  ["who built this", "IDENTITY_TEAM"],
  ["are you an ai", "IDENTITY_AI"],
  ["what is your website", "WEBSITE"],
  ["what is your website name", "WEBSITE"],
  ["how do follow ups work", "FOLLOWUPS"],
  ["what is gmail connect", "GMAIL_SETUP"],
  ["how do i connect gmail", "GMAIL_SETUP"],
  ["how do i pause a campaign", "PAUSE_CAMPAIGN"],
  ["where do i see replies", "SEE_REPLIES"],
  ["how do i start", "START"],
  ["how to get started", "START"],
  ["how do i add a booking link", "BOOKING_LINK"],
  ["why am i here", "WELCOME"],
]) {
  check(topic(text) === want, `answers: ${text}`, topic(text) ?? "null");
}

// ---- the widget's own suggestions: safe ones must not cost a model call -
// The first suggestion used to spend an AI call even though the exact answer
// already exists. These are the safe, repeatable ones.
for (const [text, want] of [
  ["How do I start sending?", "START"],
  ["How do I handle replies?", "SEE_REPLIES"],
]) {
  check(topic(text) === want, `widget suggestion is fast: ${text}`, topic(text) ?? "null");
}
// Pricing is money. Troubleshooting depends on the account. "Is my Gmail
// safe?" deserves the full safety answer, not the setup checklist. All three
// must reach the model.
for (const text of [
  "What are the pricing plans?",
  "Why aren't my emails sending?",
  "Is my Gmail safe?",
]) {
  refuses(text);
}

// ---- polite shells and typos are handled, not guessed -------------------
for (const [text, want] of [
  ["hi, how to get leads", "LEAD_FINDING"],
  ["please how do i connect gmail", "GMAIL_SETUP"],
  ["how do follow ups work please", "FOLLOWUPS"],
  ["how do i conect my gmal", "GMAIL_SETUP"],
  ["show my campains", null],
]) {
  check(topic(text) === want, `normalises: ${text}`, topic(text) ?? "null");
}

// ---- money, law, account, personal data: never local -------------------
for (const text of [
  "how much is starter plan",
  "what is the free plan",
  "how do i cancel",
  "my card was charged twice",
  "can i get a refund",
  "do you offer a discount",
  "what is the refund policy",
  "delete my account",
  "is my data safe",
  "my invoice says our previous payment provider",
  "can you find emails of parents",
  "i need emails of students",
]) {
  refuses(text);
}

// ---- mixed or extended questions: the AI must answer every part --------
for (const text of [
  "how to get leads and how much is starter",
  "what does outship do and what is the free plan",
  "how do i connect gmail and pause a campaign",
  "how to get leads thats what i am asking",
  "so build it",
  "email going to spam",
  "how do follow ups work after 3 days",
  "what is gmail connect 2",
  "recommend a school name",
  "can you say a poem about a cat",
  // A real city that looks like a typo. Guessing here would answer a
  // different question than the one asked.
  "how to get leeds",
]) {
  refuses(text);
}

// ---- Arabic goes to the model so the reply is in Arabic ----------------
refuses("كيف أبدأ");
refuses("ما هو outship");
refuses("مرحبا how do i start");

// ---- account data and addresses are not fast questions -----------------
refuses("email gamil@example.com");
refuses("is gmail connected for me");
refuses("am i signed in");
refuses("what plan am i on");

// ---- the answer text itself is versioned and safe ----------------------
const all = [
  "hi", "thanks", "what does outship do", "what is your website", "are you an ai",
  "who built this", "how to get leads", "how do i connect gmail", "how do follow ups work",
  "how do i pause a campaign", "where do i see replies", "how do i start",
  "how do i add a booking link", "why am i here",
].map((q) => fastSupportAnswer(q)).filter(Boolean);

check(all.length === 14, "every versioned answer is reachable", String(all.length));
for (const a of all) {
  check(a.reply.length <= 520, `${a.topic} stays short enough for a chat bubble — ${a.reply.length}`);
  check(!/\$\d|\b(refund|billing|invoice|charge|price|pricing)\b/i.test(a.reply), `${a.topic} makes no money claim`);
}
check(
  fastSupportAnswer("how do follow ups work")?.reply.includes("day 3, 7, 14 and 21"),
  "follow-up answer uses the real four-touch schedule",
);
check(
  fastSupportAnswer("how to get leads")?.reply.includes("Contacts → Find Leads with AI"),
  "lead answer uses the labels the current UI shows",
);
check(
  fastSupportAnswer("how do i start")?.reply.includes("Add to Campaign"),
  "start answer uses the real save button",
);
check(
  fastSupportAnswer("how do i start")?.reply.includes("Review → Preview"),
  "start answer uses the real launch path",
);
check(
  !fastSupportAnswer("how do i start")?.reply.includes("AI Write"),
  "start answer no longer names a button that does not exist",
);

// ---- history rehydration ------------------------------------------------
for (const a of all) {
  check(fastTopicForReply(a.reply) === a.topic, `reverse lookup: ${a.topic}`, fastTopicForReply(a.reply) ?? "null");
}
check(fastTopicForReply("a normal AI answer") === null, "a normal AI answer is not marked fast");
check(fastTopicForReply("") === null, "empty reply is not marked fast");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
