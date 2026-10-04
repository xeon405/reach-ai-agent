// Guards for the two failures that made the agent read as broken:
//   1. the same reply coming back four times in a row
//   3. "what do you know about my business" dead-ending on a fixed string
import { repeatCount } from "../../supabase/functions/_shared/agent-understand.ts";

let checks = 0;
const check = (label, ok, detail) => {
  checks++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
};

const turn = (content, role = "assistant") => ({ role, content });

// --- the exact line that repeated four times ------------------------------
const SEGMENTED =
  "You have 5 contacts but they are not segmented yet. Tell me the kind of company you want and I will filter them.";

{
  const history = [turn(SEGMENTED), turn(SEGMENTED), turn(SEGMENTED)];
  check("identical reply is detected as a repeat", repeatCount(SEGMENTED, history) === 3, `count=${repeatCount(SEGMENTED, history)}`);
}

// --- minor rewording of the same reply still counts -----------------------
{
  const history = [turn("You have 5 contacts but they are not segmented yet - tell me the kind of company you want and I will filter them.")];
  check("reworded repeat is still caught", repeatCount(SEGMENTED, history) >= 1, `count=${repeatCount(SEGMENTED, history)}`);
}
{
  const history = [turn("Tell me the kind of company you want and I will filter them.")];
  check("a substring of an earlier reply counts", repeatCount(SEGMENTED, history) >= 1);
}

// --- genuinely new replies must NOT be flagged ----------------------------
{
  const history = [turn("You sell same-day boiler repair services.")];
  check("a different answer is not a repeat", repeatCount(SEGMENTED, history) === 0);
  check("a different answer is not a repeat (2)", repeatCount("Your plan is growth, 10 emails a day.", history) === 0);
}

// --- empty / trivial replies do not false-positive ------------------------
{
  check("empty reply never counts", repeatCount("", [turn(SEGMENTED)]) === 0);
  check("blank assistant turn is skipped", repeatCount("ok", [turn("   ")]) === 0);
}

// --- lookback window ------------------------------------------------------
{
  // The stale repeat sits 5 assistant turns back, outside a 2-turn window.
  const history = [turn(SEGMENTED), turn("unrelated one"), turn("unrelated two"), turn("unrelated three"), turn("unrelated four"), turn("current and different")];
  check("old repeats beyond the lookback are ignored", repeatCount("current and different", history, 2) === 0, `count=${repeatCount("current and different", history, 2)}`);
}
{
  // Same history, wider window: the stale repeat is now visible again.
  const history = [turn(SEGMENTED), turn("unrelated one"), turn("unrelated two"), turn("unrelated three"), turn("unrelated four"), turn(SEGMENTED)];
  check("a wider lookback does see the stale repeat", repeatCount(SEGMENTED, history, 8) === 2, `count=${repeatCount(SEGMENTED, history, 8)}`);
}
{
  const history = [turn("older"), turn(SEGMENTED)];
  check("recent repeat inside the lookback is seen", repeatCount(SEGMENTED, history, 4) === 1);
}

// --- user turns are ignored -----------------------------------------------
{
  const history = [turn(SEGMENTED, "user")];
  check("a user echo is not counted as our repeat", repeatCount(SEGMENTED, history) === 0);
}

console.log(checks > 0 && checks === 11 ? "\n11 repeat-guard checks passed." : `\nFAILURES: ran ${checks}`);
process.exit(checks === 11 ? 0 : 1);