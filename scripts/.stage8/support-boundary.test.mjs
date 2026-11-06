// Support-chat capability boundary: offline, deterministic, no network.
//
// The regression this locks down: a tutor asked "can I find emails of parents
// from your platform?" and the router matched the word "emails", so the Guide
// answered with a Gmail setup + sending checklist. It never said what the
// product cannot do, which reads as "yes, we have parent lists".
//
// Run: node scripts/.stage8/support-boundary.test.mjs
import { isPersonalContactRequest, personalContactAnswer } from "../../supabase/functions/_shared/support-boundary.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

// ---- the exact message from the support transcript ------------------------
const REAL = "i wanna know can i find emails of parents from your platform";
check(isPersonalContactRequest(REAL) === true, "the real transcript message is caught");
check(
  isPersonalContactRequest("i give tution to students and i am not getting emails of parents can your platform give me that"),
  "the tutor's first message is caught",
);

// ---- variants that must also be caught ------------------------------------
for (const m of [
  "can you give me parents emails",
  "do you sell a list of student emails",
  "i need phone numbers of homeowners",
  "where can i find patients emails",
  "can i email parents of my students",
  "do you have a database of residents",
  "can i buy consumer email addresses",
  "i want parents whatsapp numbers",
]) {
  check(isPersonalContactRequest(m) === true, `caught: ${m}`);
}

// ---- business asks must NOT be caught (false positives are the other bug) --
for (const m of [
  "find tuition centres in dubai",
  "how do i find leads",
  "find schools in riyadh",
  "why are my emails not sending",
  "can i import my own leads",
  "find businesses that need tutoring",
  "how many emails can i send per day",
  "connect my gmail",
  "find coaching institutes in abu dhabi",
]) {
  check(isPersonalContactRequest(m) === false, `not caught: ${m}`);
}

// ---- the answer itself ----------------------------------------------------
const signedIn = personalContactAnswer({ signedIn: true });
const guest = personalContactAnswer({ signedIn: false });

check(/^\*\*Short answer: no/.test(signedIn), "the refusal is the first line, not buried");
check(/business/i.test(signedIn), "states the real scope: business addresses");
check(/do not buy, scrape, or sell/i.test(signedIn), "states we do not trade personal data");
check(/Google Maps/.test(signedIn), "names the actual data source");
check(!/we (have|can provide) (parent|personal)/i.test(signedIn), "never promises personal data");
check(/Leads → Import CSV/.test(signedIn), "signed-in answer gives the consented-list path");
check(/after signing up/i.test(guest), "guest answer does not assume a dashboard");
check(/tuition cent|coaching|schools/i.test(signedIn), "gives a real business alternative");
check(signedIn.length < 1700, "stays short enough for a chat bubble", `${signedIn.length} chars`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILURES:\n  - " + failures.join("\n  - ")); process.exit(1); }
