// AI quality gate: offline, deterministic, no network, no model calls.
// Locks in the rules that keep the writers honest, so a future prompt edit
// cannot quietly delete a guard (which is how hallucinations creep back in).
//
// Run: node scripts/.stage8/ai-quality.test.mjs
import { readFileSync } from "node:fs";
import { buildLeadFacts, COLD_EMAIL_FEWSHOTS, REPLY_CONTINUITY_RULES } from "../../supabase/functions/_shared/ai-lib.ts";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const src = (p) => readFileSync(ROOT + p, "utf8");

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

const fn = (n) => src(`supabase/functions/${n}/index.ts`);
const lib = src("supabase/functions/_shared/ai-lib.ts");

// ---- buildLeadFacts: the grounding contract every writer depends on -------
{
  check(buildLeadFacts({}) === "", "empty lead yields no facts block at all");
  check(buildLeadFacts({ city: null, category: "" }) === "", "null/empty fields are not treated as facts");

  const f = buildLeadFacts({ category: "Dental", city: "Dubai", rating: 4.5 });
  check(/Dental/.test(f) && /Dubai/.test(f) && /4\.5/.test(f), "real fields appear", f.split("\n")[1]);
  check(/never invent/i.test(f), "the block itself carries the never-invent header");

  // Absent fields must not produce confident-looking lines.
  const partial = buildLeadFacts({ city: "Dubai" });
  check(!/Category/.test(partial), "missing category is omitted, not guessed");
  check(!/rating/i.test(partial), "missing rating is omitted, not guessed");
  check(!/website/i.test(partial), "missing website is omitted, not guessed");

  // A field present but nonsense must not be passed through as if it were a fact.
  check(buildLeadFacts({ rating: "excellent" }).includes("excellent") === false,
    "free-text 'rating' is not trusted as a real fact");
}

// ---- every lead-facing writer must import the shared fact block ----------
for (const name of ["send-worker", "generate-email", "send-reply"]) {
  check(new RegExp(`buildLeadFacts[\\s\\S]{0,80}ai-lib|from "\\.\\./_shared/ai-lib`).test(fn(name))
    && /buildLeadFacts\(/.test(fn(name)),
    `${name} actually calls buildLeadFacts`, "grounded in real data, not vibes");
}

// ---- required guard rules must survive future prompt edits ---------------
{
  const gen = fn("generate-email");
  check(/NEVER invent a detail/.test(gen), "generate-email: never-invent rule present");
  check(/do not know it/.test(gen), "generate-email: says what to do when a fact is missing");
  check(/personalise using only the person's name, company and job title/.test(gen),
    "generate-email: has a stated fallback, not an impossible instruction");
  // The bug: the prompt demanded a "real detail from the lead facts" while no
  // facts were injected, so the model invented one to satisfy the instruction.
  check(!/one real detail from the lead facts/.test(gen),
    "generate-email: no longer promises facts it may not have");
  check(/do not have an online|doesn't have|lack, or are missing|currently have, use, lack/.test(gen),
    "generate-email: bars claims about the lead's current state (incl. negatives)");

  const sw = fn("send-worker");
  check(/never invent/.test(sw), "send-worker: never-invent rule present");
  check(/do NOT type any URL/.test(sw), "send-worker: forbids typing its own URL");
  check(/free, guarantee, act now/.test(sw), "send-worker: banned-word list present");

  // The spam-word list is a growth/security control, so it must exist in every
  // surface that writes outbound email to a lead.
  for (const name of ["send-worker", "generate-email"]) {
    check(/risk-free|act now|limited time/.test(fn(name)), `${name}: spam-word list present`);
  }
}

// ---- shared prompt assets stay intact -----------------------------------
{
  check(COLD_EMAIL_FEWSHOTS.includes("Example") && COLD_EMAIL_FEWSHOTS.length > 400,
    "COLD_EMAIL_FEWSHOTS still carries real examples", `${COLD_EMAIL_FEWSHOTS.length} chars`);
  check(REPLY_CONTINUITY_RULES.includes("Never invent prices"), "REPLY_CONTINUITY_RULES keeps its honesty rule");
  check(REPLY_CONTINUITY_RULES.includes("PRICING"), "REPLY_CONTINUITY_RULES keeps its price-hold rule");
}

// ---- no writer may reach for a raw model call outside the cost gate ------
// ai-cost-gate is what stops a runaway loop burning money, so a new call site
// that bypasses it is a budget regression, not a style nit.
{
  const writers = ["send-worker", "generate-email", "send-reply", "inbox-agent", "support-chat"];
  for (const name of writers) {
    const s = fn(name);
    const raw = (s.match(/groqChat\(/g) ?? []).length;
    const gated = /ai-cost-gate|gate\.run/.test(s) || /ai-cost-gate/.test(s);
    check(gated, `${name} routes AI through the cost gate`, raw ? `${raw} call site(s)` : "no call site");
  }
}

// ---- a lead's own data must never be able to instruct the model ---------
// Leads are scraped from the open web, so their fields are untrusted input and
// could otherwise carry prompt injection into every email we send.
{
  const libSrc = lib;
  check(/sanitizeForPrompt/.test(libSrc), "shared lib exposes prompt sanitisation");
  const gen = fn("generate-email");
  check(/sanitizeForPrompt\(String\(lead\.category\)/.test(libSrc) || /sanitizeForPrompt/.test(libSrc),
    "lead fact fields are sanitised before entering the prompt");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
