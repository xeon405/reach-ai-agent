// AI quality gate — runs in DENO, the real Edge runtime, so it exercises the
// same module the functions import (no Node stand-in that could drift).
//
// Locks in the rules that keep the writers honest. A prompt edit that quietly
// deletes a guard is how hallucinations creep back in; this fails the build
// instead.
//
// Run: deno run --allow-read --allow-net --allow-env scripts/.stage8/ai-quality.test.ts
import { buildLeadFacts, COLD_EMAIL_FEWSHOTS, REPLY_CONTINUITY_RULES } from "../../supabase/functions/_shared/ai-lib.ts";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const src = (p: string) => Deno.readTextFileSync(ROOT + p);
const fn = (n: string) => src(`supabase/functions/${n}/index.ts`);

let passed = 0;
const failures: string[] = [];
function check(ok: boolean, label: string, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

// ---- buildLeadFacts: the grounding contract every writer depends on -------
{
  check(buildLeadFacts({}) === "", "empty lead yields no facts block at all");
  check(buildLeadFacts({ city: null, category: "" }) === "", "null/empty fields are not facts");

  const full = buildLeadFacts({ category: "Dental", city: "Dubai", rating: 4.5 });
  check(/Dental/.test(full) && /Dubai/.test(full) && /4\.5/.test(full), "real fields appear");
  check(/never invent/i.test(full), "the block itself carries the never-invent header");

  // An absent field must produce no line at all, never a guessed one.
  const partial = buildLeadFacts({ city: "Dubai" });
  check(!/Category/.test(partial), "missing category is omitted, not guessed");
  check(!/rating/i.test(partial), "missing rating is omitted, not guessed");
  check(!/website/i.test(partial), "missing website is omitted, not guessed");
  check(!/email/i.test(partial), "missing email status is omitted, not guessed");

  // A rating must be numeric to be trusted; free text is not a fact.
  check(!/excellent/i.test(buildLeadFacts({ rating: "excellent" })),
    "free-text 'rating' is not trusted as a real fact");
}

// ---- cold-outreach writers must actually use the shared fact block ------
// Deliberately NOT send-reply: a reply continues an existing conversation, so
// the thread is its context. Demanding lead-record facts there would push the
// model to pad a reply with cold-call detail that does not belong in it.
for (const name of ["send-worker", "generate-email"]) {
  check(
    /from "\.\.\/_shared\/ai-lib\.ts"/.test(fn(name)) && /buildLeadFacts\(/.test(fn(name)),
    `${name} calls buildLeadFacts`,
    "grounded in real data",
  );
}
check(
  /REPLY_CONTINUITY_RULES/.test(fn("send-reply")),
  "send-reply carries the continuity/honesty rules",
  "replies ground in the thread, not the lead record",
);

// ---- required guard rules must survive future prompt edits ---------------
{
  const gen = fn("generate-email");
  check(/NEVER invent a detail/.test(gen), "generate-email: never-invent rule present");
  check(/you do not know it, so do not write it/.test(gen), "generate-email: states the missing-fact rule");
  check(/personalise using only the person's name, company and job title/.test(gen),
    "generate-email: has a workable fallback, not an impossible instruction");
  // The original bug: the prompt demanded "one real detail from the lead facts"
  // while injecting no facts, so the model invented one to satisfy the rule.
  check(!/one real detail from the lead facts/.test(gen),
    "generate-email: no longer promises facts it may not have");
  check(/currently have, use, lack, or are missing/.test(gen),
    "generate-email: bars claims about the lead's current state (incl. negatives)");

  const sw = fn("send-worker");
  check(/never invent/.test(sw), "send-worker: never-invent rule present");
  check(/do NOT type any URL/.test(sw), "send-worker: forbids typing its own URL");
  check(/free, guarantee, act now/.test(sw), "send-worker: banned-word list present");
}

// ---- every surface that writes an outbound email needs the spam guard -----
// The banned-word list is what keeps Gmail from filing a real customer's
// outreach in spam, so a missing list is a revenue bug, not a style nit.
for (const name of ["send-worker", "generate-email"]) {
  check(
    /free, guarantee, act now, limited time, risk-free/.test(fn(name)),
    `${name}: spam-word list present`,
  );
}

// ---- shared prompt assets stay intact ------------------------------------
check(COLD_EMAIL_FEWSHOTS.includes("Example") && COLD_EMAIL_FEWSHOTS.length > 400,
  "COLD_EMAIL_FEWSHOTS still carries real examples", `${COLD_EMAIL_FEWSHOTS.length} chars`);
check(REPLY_CONTINUITY_RULES.includes("Never invent prices"),
  "REPLY_CONTINUITY_RULES keeps its honesty rule");
check(REPLY_CONTINUITY_RULES.includes("PRICING"),
  "REPLY_CONTINUITY_RULES keeps its price-hold rule");

// ---- a new AI call site must not bypass spend control --------------------
// ai-cost-gate caps per-request USD; consume_ai_quota is an atomic per-user
// daily cap. Either is real control. A surface with neither spends our Groq
// credits on whoever calls it, so that combination must never ship.
for (const name of ["send-worker", "generate-email", "send-reply", "inbox-agent", "support-chat"]) {
  const s = fn(name);
  const calls = (s.match(/groqChat\(/g) ?? []).length;
  const gated = /ai-cost-gate/.test(s) || /gate\.run/.test(s) || /consume_ai_quota/.test(s);
  check(gated || calls === 0, `${name} has a spend control on its AI calls`, calls ? `${calls} call site(s)` : "no raw call site");
}

// ---- lead data is untrusted input and must be sanitised -----------------
// Lead fields are scraped from the open web, so they are attacker-influenced
// and could otherwise carry prompt injection into every email we send.
{
  const libSrc = src("supabase/functions/_shared/ai-lib.ts");
  // The template expression that consumes each field FOLLOWS the field
  // reference, so the check must look forward, not backward.
  for (const field of ["lead.category", "lead.city", "lead.website"]) {
    const i = libSrc.indexOf(field);
    check(i !== -1 && libSrc.slice(i, i + 70).includes("sanitizeForPrompt"),
      `lead fact ${field} is sanitised before entering the prompt`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  Deno.exit(1);
}
console.log("NO FAILURES");
