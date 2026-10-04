// ============================================================================
// Deterministic slot backfill.
//
// The model identifies the goal reliably but sometimes drops a slot the person
// clearly typed. "add my London dentists to a campaign" came back as params:{}
// and the person had to repeat themselves. Copying a word they actually typed
// is not guessing - but inventing one would be.
//
// The hard rule: this may only ADD a slot the model left empty. It must never
// overwrite a value the model chose, or it could contradict an explicit
// instruction like "not London, Leeds".
// ============================================================================

import assert from "node:assert/strict";
import { extractProperNouns, backfillSlots } from "../../supabase/functions/_shared/agent-slots.ts";

let checks = 0;
const check = (label, ok) => {
  checks++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};

// ---- proper nouns ----------------------------------------------------------
check("finds a mid-sentence capital", extractProperNouns("add my London dentists to a campaign").includes("London"));
check("ignores the first word (grammar)", !extractProperNouns("Pause London now").includes("Pause"));
check("ignores command verbs", !extractProperNouns("Please Find London leads").includes("Please"));
check("ignores greetings", !extractProperNouns("hi my London shop").includes("hi"));
check("ignores short tokens", !extractProperNouns("go to LA now").includes("LA"));
check("ignores all-caps acronyms", !extractProperNouns("send to Q3 in London").includes("Q3"));
check("de-duplicates", extractProperNouns("London and london").length === 1);
check("handles punctuation", extractProperNouns("my London, dentists;").includes("London"));
check("empty message yields nothing", extractProperNouns("").length === 0);

// ---- backfill: the important guarantees ------------------------------------
check("fills city from a single proper noun", backfillSlots("add my London dentists", {}).city === "London");
check("recognises a country", backfillSlots("find leads in Germany", {}).country === "Germany");

// THE GUARANTEE: never overwrite what the model decided.
check("never overwrites an existing city", backfillSlots("add my London dentists", { city: "Leeds" }).city === "Leeds");
check("never overwrites an existing country", backfillSlots("leads in Germany", { country: "UK" }).country === "UK");
check("never overwrites an existing category", backfillSlots("my London dentists", { category: "Plumbers" }).category === "Plumbers");

// Two proper nouns is genuinely ambiguous (category + city, or two cities).
// Asking is better than guessing.
check("two proper nouns fill nothing", Object.keys(backfillSlots("my London and Leeds dentists", {})).length === 0);
check("a single non-place word fills nothing", Object.keys(backfillSlots("thanks", {})).length === 0);
check("no nouns fills nothing", Object.keys(backfillSlots("pause it", {})).length === 0);

// ---- city and category arrive INDEPENDENTLY -------------------------------
// The model reliably captures the trade and misses the place. An all-or-nothing
// guard ("if category is set, give up") threw the city away in exactly the case
// backfill exists for: category:"dentists" + no city, message says London.
check("city is backfilled even when category is already set",
  backfillSlots("add my London dentists to a campaign", { category: "dentists" }).city === "London");
check("country is backfilled even when category is already set",
  backfillSlots("find dentists in Germany", { category: "dentists" }).country === "Germany");
check("both fill when both are missing",
  backfillSlots("find London plumbers", {}).city === "London");
check("a country plus a category leaves the city alone",
  backfillSlots("find London dentists in Germany", { category: "dentists" }).country === "Germany");

console.log(`\n${checks} slot-backfill checks passed.`);
