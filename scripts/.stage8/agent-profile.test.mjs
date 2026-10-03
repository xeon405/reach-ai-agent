// ============================================================================
// Business-profile memory.
//
// The behaviour under test, without a network:
//
//   "i own out-ship.com, it is my platform and I want to email clients to
//    prove it works"
//     -> the agent ACKNOWLEDGES and RETAINS product + goals
//     -> next visit it no longer re-asks what they sell
//
// Before this, business context lived only in message history. Nothing was
// ever extracted, so it could not be reused, and describing a business could
// even be misread as a request to name a campaign.
//
// Pure functions over plain objects, so this runs in Node with no Supabase.
// ============================================================================

import assert from "node:assert/strict";

import {
  cleanFacts, hasFacts, nextGap, renderProfile,
} from "../../supabase/functions/_shared/agent-profile.ts";

let checks = 0;
const check = (label, ok) => {
  checks++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};

// ---- what counts as a fact -------------------------------------------------
check("trims a padded value", cleanFacts({ product: "  Reach, a cold-email platform  " }).product === "Reach, a cold-email platform");

// The point of these is what gets THROWN AWAY. Storing "n/a" would make the
// agent believe it had asked and been told nothing, and it would stop asking.
check("a blank value is not knowledge", cleanFacts({ product: "   " }).product === undefined);
check("'n/a' is not an answer", cleanFacts({ audience: "n/a" }).audience === undefined);
check("'unknown' is not an answer", cleanFacts({ goals: "unknown" }).goals === undefined);
check("'not sure' is not an answer", cleanFacts({ notes: "not sure" }).notes === undefined);

check("caps a runaway field", cleanFacts({ product: "x".repeat(9999) }).product.length === 400);
check("ignores keys we do not own", cleanFacts({ evil: "nope" }).evil === undefined);
check("rejects a non-string", cleanFacts({ product: 42 }).product === undefined);
check("tolerates null", cleanFacts(null).product === undefined);
check("an empty object yields nothing", Object.keys(cleanFacts({})).length === 0);

check("one real fact counts", hasFacts({ product: "Reach" }) === true);
check("nothing is not something", hasFacts({}) === false);
check("an empty string is not something", hasFacts({ product: "" }) === false);

// ---- what to ask next ------------------------------------------------------
check("a stranger is asked what they sell first", nextGap(null) === "product");
check("then who they sell to", nextGap({ product: "Reach" }) === "audience");
check("then what they want", nextGap({ product: "Reach", audience: "agency owners" }) === "goals");
check("a full profile asks nothing", nextGap({ product: "a", audience: "b", goals: "c" }) === null);

// ---- how it reaches the model ---------------------------------------------
check("no profile renders nothing", renderProfile(null) === "");
check("an empty profile renders nothing", renderProfile({}) === "");

const out = renderProfile({ product: "Reach", audience: "agency owners", goals: "book demos" });
check("keeps the product", out.includes("Reach"));
check("keeps the audience", out.includes("agency owners"));
check("keeps the goals", out.includes("book demos"));
// It has to read as something the PERSON said. Without that the model treats
// it as its own invention and quietly starts doubting it.
check("attributes it to them", /told me about their business/i.test(out));
check("tells the model not to re-ask", /Never ask again/i.test(out));

console.log(`\n${checks} profile-memory checks passed.`);