// The token cap used to cut replies mid-word ("...Vancouver, Sydney, Me" from
// "Melbourne"). A severed fragment is worse than a shorter complete sentence.
import { trimTruncatedReply, repeatCount } from "../../supabase/functions/_shared/agent-understand.ts";

let checks = 0;
let failures = 0;
const check = (label, ok, detail) => {
  checks++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

// --- complete replies must never be touched ---
const intact = [
  ["period", "Your sending reputation is healthy."],
  ["question", "Want me to find contacts first?"],
  ["exclamation", "You are all caught up!"],
  ["parenthesis", "Nothing needs your attention (the list is clean)."],
  // The live bug: ":" introduces the results table, so it is a finished reply.
  // trimTruncatedReply used to delete the last word, shipping
  // "Here is your sending health:" as "Here is your sending".
  ["colon introducing rows", "Here is your sending health:"],
  ["rows lead-in", "Here are your numbers:"],
  ["ellipsis", "You are clear, nothing to fix…"],
  ["closing quote", 'You said "stop everything" last week.'],
];
for (const [name, text] of intact) {
  check(`intact: ${name}`, trimTruncatedReply(text) === text, `got ${JSON.stringify(trimTruncatedReply(text))}`);
}

// --- genuinely severed replies must be cut back ---
{
  const out = trimTruncatedReply("I would start in Toronto, Vancouver, Sydney, Me");
  check("severed tail word is dropped", !/\bMe$/.test(out), JSON.stringify(out));
  check("severed reply keeps the earlier cities", /Sydney/.test(out), JSON.stringify(out));
}
{
  const first = "Here is everything you asked for and it is quite a long answer indeed.";
  const out = trimTruncatedReply(`${first} The rest of the senten`);
  check("truncated after a sentence boundary stops there", out === first, JSON.stringify(out));
}
{
  const out = trimTruncatedReply("The first part is done, the second half was cut");
  check("continuing comma ending is treated as cut", !/cut$/.test(out), JSON.stringify(out));
}

// --- degenerate inputs ---
check("empty stays empty", trimTruncatedReply("") === "");
check("whitespace only stays empty", trimTruncatedReply("   ") === "");
check("single word is returned, not deleted", trimTruncatedReply("Paused.") === "Paused.");
check("surrounding whitespace trimmed", trimTruncatedReply("  All good.  ") === "All good.");

// repeatCount is exported from the same module and used by the executor path.
{
  const h = [{ role: "assistant", content: "You sell dental services in London." }];
  check("repeatCount still detects a repeat", repeatCount("You sell dental services in London.", h) === 1);
  check("repeatCount ignores a different reply", repeatCount("Something else entirely.", h) === 0);
}

console.log(failures === 0 ? `\n${checks} truncation-guard checks passed.` : `\nFAILURES: ${failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);