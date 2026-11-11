// Review mode: the decision to hold an email before sending.
// Offline, deterministic.
//
// Run: node scripts/.stage8/review-mode.test.mjs
import {
  REVIEW_FIRST_SENDS,
  shouldHoldForReview,
} from "../../supabase/functions/_shared/review-mode.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

check(REVIEW_FIRST_SENDS === 20, "the period is the first 20 emails");

// ── default mode: first 20 ────────────────────────────────────────────────
{
  check(shouldHoldForReview("first_20", 0), "a new account holds its first draft");
  check(shouldHoldForReview("first_20", 19), "the 20th email is still held", "19 sent");
  check(!shouldHoldForReview("first_20", 20), "after 20 sends the hold ends");
  check(!shouldHoldForReview("first_20", 200), "an established account is not held");
  check(shouldHoldForReview(undefined, 3), "a missing mode defaults to review, not to sending");
  check(shouldHoldForReview(null, 3), "a null mode defaults to review");
  check(shouldHoldForReview("", 3), "an empty mode defaults to review");
  check(shouldHoldForReview("first-20", 3), "a typo fails safe to review");
  check(shouldHoldForReview("yes", 3), "an unknown value fails safe to review");
}

// ── always ────────────────────────────────────────────────────────────────
{
  check(shouldHoldForReview("always", 0), "always holds a new account");
  check(shouldHoldForReview("always", 500), "always holds an established account");
}

// ── off ───────────────────────────────────────────────────────────────────
{
  check(!shouldHoldForReview("off", 0), "off lets a new account send");
  check(!shouldHoldForReview("off", 500), "off lets an established account send");
}

// ── bad counts ────────────────────────────────────────────────────────────
{
  check(shouldHoldForReview("first_20", NaN), "a NaN count is treated as zero and held");
  check(shouldHoldForReview("first_20", -5), "a negative count is held");
  check(!shouldHoldForReview("first_20", 20.5), "a count past the line is not held");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
