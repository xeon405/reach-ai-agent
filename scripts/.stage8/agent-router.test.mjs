// Router tests. Pure module, runs under Node 24, imports the REAL source.
// Run: node scripts/.stage8/agent-router.test.mjs
import {
  routeIntent,
  isWriteIntent,
  READ_INTENTS,
  WRITE_INTENTS,
  INTENT_DESCRIPTIONS,
} from "../../supabase/functions/_shared/agent-router.ts";

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const r = (m) => routeIntent(m);

// ---- the customer's own vocabulary all routes the same way ----------------
// "leads" is agency jargon, so people say customers, businesses, people, contacts.
for (const word of ["leads", "customers", "businesses", "companies", "contacts", "people"]) {
  const hit = r(`find ${word} in dubai`);
  check(hit?.intent === "find_contacts", `"find ${word} in dubai" routes without AI`);
}
for (const verb of ["find", "search for", "look for", "get me", "show me", "i need"]) {
  const hit = r(`${verb} dentists in dubai`);
  check(hit?.intent === "find_contacts", `"${verb} dentists in dubai" routes`);
}

// ---- parameter extraction -------------------------------------------------
{
  const h = r("find dentists in dubai");
  check(h?.params.city === "dubai", "city extracted", String(h?.params.city));
  check(h?.params.category === "dentists", "category extracted", String(h?.params.category));
  check(h?.params.limit === undefined, "no invented limit when none was asked for");
}
{
  const h = r("find 50 plumbers in manchester united kingdom");
  check(h?.params.limit === 50, "numeric count extracted", String(h?.params.limit));
  check(h?.params.country === "United Kingdom", "country name extracted and properly cased", String(h?.params.country));
}
{
  const h = r("find 5000 cafes in paris");
  check(h?.params.limit === 200, "count is capped at 200 so one request cannot pull the table", String(h?.params.limit));
}
{
  const h = r("find dentists in uae");
  check(h?.params.country === "United Arab Emirates", "short country code expanded", String(h?.params.country));
}
{
  const h = r("find twenty lawyers");
  check(h?.params.limit === 20, "written number understood", String(h?.params.limit));
}

// ---- typo cleanup: the same command, one model call cheaper --------------
{
  const h = r("pase my campain");
  check(h?.intent === "pause_campaign" && isWriteIntent(h.intent), "a misspelled pause still routes as a WRITE");
  const l = r("show my campains");
  check(l?.intent === "list_campaigns", "a misspelled campaign list still routes");
  const s = r("how many emials have i sent");
  check(s?.intent === "campaign_stats", "a misspelled emails question still routes to stats");
}
{
  // The important negative: "leeds" is a real city. A typo table that turned
  // it into "leads" would silently search the wrong place, which is exactly the
  // kind of "free" answer we must never ship.
  const h = r("find dentists in leeds");
  check(h?.intent === "find_contacts", "a city that looks like a typo still routes");
  check(h?.params.city === "leeds", "the city is left exactly as typed", String(h?.params.city));
}

// ---- the commands that change things are writes and need a confirm -------
{
  const pause = r("pause campaign called spring sale");
  check(pause?.intent === "pause_campaign" && isWriteIntent(pause.intent), "pause is a WRITE intent");
  check(pause?.params.campaignName === "spring sale", "campaign name captured", String(pause?.params.campaignName));
  check(/spring sale/.test(pause?.summary ?? ""), "summary names the campaign before it runs");

  const create = r("create a new campaign called dubai dentists");
  check(create?.intent === "create_campaign_draft" && isWriteIntent(create.intent), "create is a WRITE intent");
  check(create?.params.campaignName === "dubai dentists", "new campaign name captured", String(create?.params.campaignName));

  const add = r("add my saved contacts to campaign called spring sale");
  check(add?.intent === "add_contacts_to_campaign" && isWriteIntent(add.intent), "add-to-campaign is a WRITE intent");
}

// ---- read commands are NOT writes ---------------------------------------
for (const m of [
  "list my campaigns",
  "show me my campaigns",
  "how many emails have been sent",
  "show me my stats",
  "who has unsubscribed",
  "check my compliance",
  "what is my sender reputation",
  "am i banned from gmail",
]) {
  const hit = r(m);
  check(hit && READ_INTENTS.includes(hit.intent), `"${m}" routes as a safe read`, hit?.intent ?? "NO MATCH");
}

// ---- "find" must win over "create campaign" when both words appear ------
{
  const h = r("find 30 dental clinics in dubai and add them to my spring campaign");
  check(h?.intent === "find_contacts", "a find request is not hijacked by the word campaign", h?.intent);
}

// ---- unknown requests return null so exactly one AI call happens ---------
for (const m of [
  "what do you think about the weather in karachi",
  "can you write me a poem",
  "explain how compound interest works",
]) {
  check(r(m) === null, `"${m}" correctly falls through to the AI`);
}

// ---- a plain answer to "what should it be called?" is NOT a command -------
// The slot-fill lane only takes the message literally when the router does not
// recognise it. A campaign name like "usa" (also a country!) must not match, or
// it would be re-read as a targeting request instead of the name.
for (const m of ["usa", "Spring Sale", "Q3 push", "dubai dentists"]) {
  check(r(m) === null, `"${m}" is treated as a name, not a command`);
}

// ---- safety properties ---------------------------------------------------
{
  check(READ_INTENTS.length + WRITE_INTENTS.length === 9, "every intent is classified as read or write");
  for (const i of READ_INTENTS) check(!isWriteIntent(i), `${i} is not a write`);
  for (const i of WRITE_INTENTS) check(isWriteIntent(i), `${i} is a write`);
  for (const i of Object.keys(INTENT_DESCRIPTIONS)) {
    check(
      READ_INTENTS.includes(i) || WRITE_INTENTS.includes(i),
      `${i} has an intent classification`,
    );
  }
  // An empty or whitespace message must not match anything.
  check(r("") === null, "empty message falls through");
  check(r("   ") === null, "whitespace message falls through");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("NO FAILURES");
