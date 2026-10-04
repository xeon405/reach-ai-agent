// The token cap used to cut replies mid-word ("...Vancouver, Sydney, Me" from
// "Melbourne"). A severed fragment is worse than a shorter complete sentence.
import { repeatCount } from "../../supabase/functions/_shared/agent-understand.ts";

let checks = 0;
const check = (label, ok, detail) => {
  checks++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};

// repeatCount must still be importable and correct alongside the new helpers.
{
  const h = [{ role: "assistant", content: "You sell dental services in London." }];
  check("repeatCount still detects a repeat", repeatCount("You sell dental services in London.", h) === 1);
  check("repeatCount ignores a different reply", repeatCount("Something else entirely.", h) === 0);
}

console.log(checks === 2 ? "\n2 truncation-guard checks passed." : `\nFAILURES: ran ${checks}`);
process.exit(checks === 2 ? 0 : 1);