// Review mode: the decision to hold an email before sending.
// Offline, deterministic.
//
// Run: node scripts/.stage8/review-mode.test.mjs
import {
  REVIEW_FIRST_SENDS,
  shouldHoldForReview,
  shouldHoldJob,
} from "../../supabase/functions/_shared/review-mode.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

check(REVIEW_FIRST_SENDS === 5, "the period is the first 5 emails");

// ── default mode: first 5 ─────────────────────────────────────────────────
{
  check(shouldHoldForReview("first_5", 0), "a new account holds its first draft");
  check(shouldHoldForReview("first_5", 4), "the 5th email is still held", "4 sent");
  check(!shouldHoldForReview("first_5", 5), "after 5 sends the hold ends");
  check(!shouldHoldForReview("first_5", 200), "an established account is not held");
  check(shouldHoldForReview(undefined, 3), "a missing mode defaults to review, not to sending");
  check(shouldHoldForReview(null, 3), "a null mode defaults to review");
  check(shouldHoldForReview("", 3), "an empty mode defaults to review");
  check(shouldHoldForReview("first-5", 3), "a typo fails safe to review");
  check(shouldHoldForReview("yes", 3), "an unknown value fails safe to review");
}

// ── legacy first_20 ───────────────────────────────────────────────────────
{
  check(shouldHoldForReview("first_20", 0), "a stale first_20 row still holds a new account");
  check(shouldHoldForReview("first_20", 4), "a stale first_20 row is treated as the first 5", "4 sent");
  check(!shouldHoldForReview("first_20", 5), "a stale first_20 row ends at 5, not 20");
  check(!shouldHoldForReview("first_20", 19), "a stale first_20 row does not hold email 6 to 20");
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
  check(shouldHoldForReview("first_5", NaN), "a NaN count is treated as zero and held");
  check(shouldHoldForReview("first_5", -5), "a negative count is held");
  check(!shouldHoldForReview("first_5", 5.5), "a count past the line is not held");
}

// ── the worker's combined rule ────────────────────────────────────────────
{
  check(!shouldHoldJob("first_5", 0, "approved", true), "an approved draft sends during the first 5");
  check(!shouldHoldJob("first_5", 4, "approved", true), "approval does not re-hold at the boundary");
  check(shouldHoldJob("first_5", 0, "approved", false), "approved but no stored text is held, not sent");
  check(shouldHoldJob("first_5", 0, "awaiting", true), "an awaiting draft is held again");
  check(shouldHoldJob("first_5", 0, null, false), "a fresh job is held during the first 5");
  check(!shouldHoldJob("first_5", 5, null, false), "a fresh job sends after the first 5");
  check(shouldHoldJob("always", 5, null, false), "always holds a fresh job past the first 5");
  check(!shouldHoldJob("always", 5, "approved", true), "always does not re-hold an approved job");
  check(!shouldHoldJob("off", 0, null, false), "off sends a fresh job");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
