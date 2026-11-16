// Typo cleanup: exact product words only. The tests that matter most are the
// NEGATIVE ones — a name, a city, an email or a number must come back byte for
// byte, even when part of it looks like a known misspelling.
//
// Run: node scripts/.stage8/typos.test.mjs
import { fixTypos } from "../../supabase/functions/_shared/typos.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const same = (input) => {
  const out = fixTypos(input);
  check(out === input, `unchanged: ${input}`, out === input ? "" : `got "${out}"`);
};

// ---- product words are corrected ---------------------------------------
check(fixTypos("pase my campain") === "pause my campaign", "phrase-aware pause + campaign");
check(fixTypos("Pase my campain") === "pause my campaign", "a sentence-start typo is still safe in the phrase");
check(fixTypos("show my campains") === "show my campaigns", "campaigns plural");
check(fixTypos("my gmal is not connected") === "my gmail is not connected", "gmail");
check(fixTypos("how many emials did i send") === "how many emails did i send", "emails");
check(fixTypos("the folowups are off") === "the followups are off", "follow-up");
check(fixTypos("conenct my gmal") === "connect my gmail", "connect");
check(fixTypos("the websit is down") === "the website is down", "website");
check(fixTypos("delte my campain") === "delete my campaign", "delete");
check(fixTypos("refnd please") === "refund please", "billing word still reaches the AI");

// ---- names, places, emails, URLs and numbers are untouched --------------
same("find dentists in leeds");
same("Leeds");
same("email gamil@example.com");
same("send it to Gamil");
same("my name is Pase");
same("visit https://gmal.example.com");
same("campaign-2");
same("$37");
same("555-1234");
same("OAuth");
same("calendly");
same("linkedin");

// A capitalised word is never rewritten even when the lowercase key exists.
check(fixTypos("Gmal is down") === "Gmal is down", "capitalised Gmal is treated as a name");

// ---- punctuation around a token is preserved ---------------------------
check(fixTypos("campain,") === "campaign,", "trailing comma survives");
check(fixTypos("(campain)") === "(campaign)", "brackets survive");
check(fixTypos('"campain"') === '"campaign"', "quotes survive");

// ---- the trap: "leeds" must never become "leads" -----------------------
check(!fixTypos("find dentists in leeds").includes("leads"), "leeds is not rewritten to leads");
same("find leads in leeds");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
