// Regression: a short clarification answer must not erase the audience the
// person already gave. The model echoes the campaign name back ("Spring Sale"
// -> city "Sale"), which used to overwrite the carried city and leave the agent
// reporting "any contacts".
import { mergeParams } from "../../supabase/functions/_shared/agent-capabilities.ts";

let checks = 0;
const check = (label, ok, detail) => {
  checks++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};

// --- the bug ---------------------------------------------------------------
{
  const m = mergeParams(
    { city: "London", category: "dentists" },
    { campaignName: "Spring Sale", city: "Sale" },
  );
  check("carried city survives a campaign-name echo", m.city === "London", `city=${m.city}`);
  check("carried category survives", m.category === "dentists", `category=${m.category}`);
  check("campaign name is still captured", m.campaignName === "Spring Sale");
}

// --- same, leaking into category instead -----------------------------------
{
  const m = mergeParams(
    { city: "London", category: "dentists" },
    { campaignName: "Spring Sale", category: "Sale" },
  );
  check("category echo is ignored", m.category === "dentists", `category=${m.category}`);
}

// --- a genuine new choice still wins ---------------------------------------
{
  const m = mergeParams({ city: "London" }, { campaignName: "Spring Sale", city: "Leeds" });
  check("a real new city still overrides", m.city === "Leeds", `city=${m.city}`);
}
{
  const m = mergeParams({ category: "dentists" }, { campaignName: "Autumn Boilers", category: "plumbers" });
  check("a real new category still overrides", m.category === "plumbers", `category=${m.category}`);
}

// --- no campaign name means no filtering -----------------------------------
{
  const m = mergeParams({ city: "London" }, { city: "Leeds" });
  check("merge without a campaign name is untouched", m.city === "Leeds", `city=${m.city}`);
}
// --- ambiguous case: city that IS a campaign word -------------------------
// Genuinely ambiguous, so the guard is deliberately conservative: it keeps the
// carried value rather than guessing. Documented behaviour, not an accident.
{
  const m = mergeParams({ city: "Leeds" }, { campaignName: "London Newsletter", city: "London" });
  check("city equal to a campaign word is treated as an echo and dropped", m.city === "Leeds", `city=${m.city}`);
}

// --- partial-word echoes are still filtered --------------------------------
{
  const m = mergeParams({ city: "London" }, { campaignName: "Spring Sale", query: "sale" });
  check("an echoed query is ignored", m.query === undefined, `query=${m.query}`);
}
{
  const m = mergeParams({}, { campaignName: "Spring Sale", city: "Spring" });
  check("single-word echo in city is ignored", m.city === undefined, `city=${m.city}`);
}

console.log(checks > 0 && checks === 10 ? "\n10 merge-guard checks passed." : `\nFAILURES: ran ${checks}`);
process.exit(checks === 10 ? 0 : 1);