// Router evaluation harness (read-only rule layer).
//
//   deno run --no-check --allow-read --allow-write --allow-run \
//     eval/run_router_eval.ts --split dev|dev2|control|probe|test|all
//
// Splits are reported separately and never mixed. `dev2` is the seen friend
// messages (51-60). `test` is an intentionally empty file until approved.
// Four-outcome scoring per row:
//   abstained                -> routeIntent returned null (went to AI)
//   wrong_intent             -> rule matched, intent is wrong
//   right_intent_wrong_params-> intent right, expected params wrong
//   correct                  -> intent right and params right (or none expected)
// Ambiguous rows are reported but not scored.
//
// Writes eval/results_<timestamp>.json. No AI calls, no database, no sends.

import { routeIntent } from "../supabase/functions/_shared/agent-router.ts";

interface Row {
  id: number;
  message: string;
  expected_intent: string;
  also_acceptable: string[];
  expected_params: Record<string, string> | null;
  noise_types: string[];
  tags?: string[];
  split: string;
  source: string;
  note: string;
  label_note?: string;
}

// -------------------------------------------------- production-compatible norm
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularWord(w: string): string {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function canonPlain(v: unknown): string {
  return norm(v).split(" ").map(singularWord).join(" ");
}
function canonCategory(v: unknown): string {
  const s = canonPlain(v);
  return s === "saloon" ? "salon" : s;
}

const PARAM_MAP: Record<string, string[]> = {
  campaign_name: ["campaignName"],
  category: ["category"],
  location: ["city", "country"],
};

const TRIGGERS: Record<string, string[]> = {
  compliance_check: ["unsubscribe", "unsubscribed", "opt out", "opt-out", "compliance", "gdpr", "spam complaint"],
  sender_health: ["sender health", "sender reputation", "reputation", "bounce rate", "bounces", "deliverability", "am i banned", "blacklist"],
  pause_campaign: ["pause"],
  campaign_stats: ["how many", "stats", "statistics", "performance", "numbers", "results", "how much did", "report"],
  list_campaigns: ["list", "show", "see", "view", "what"],
  add_contacts_to_campaign: ["add", "assign", "put", "move"],
  create_campaign_draft: ["create", "make", "new", "start", "set up", "setup"],
  suggest_targeting: ["suggest", "recommend", "better targeting", "best targeting", "who"],
  find_contacts: ["find", "search", "look for", "get me", "show me", "need", "want", "i need", "give me"],
};

function matchedPattern(message: string, intent: string): string {
  const s = norm(message);
  for (const t of TRIGGERS[intent] ?? []) if (s.includes(t)) return t;
  return "(branch guard)";
}

function paramMatches(key: string, expected: string, got: unknown): boolean {
  if (got === null || got === undefined) return false;
  return key === "category"
    ? canonCategory(expected) === canonCategory(got)
    : canonPlain(expected) === canonPlain(got);
}

// ---------------------------------------------------------------- four outcomes
type Outcome =
  | "abstained"
  | "correct"
  | "wrong_intent"
  | "right_intent_wrong_params"
  | "ambiguous";

interface Scored {
  row: Row;
  handled: boolean;
  got: string | null;
  params: Record<string, unknown> | null;
  intentCorrect: boolean;
  viaAcceptable: boolean;
  paramChecked: boolean;
  paramCorrect: boolean;
  outcome: Outcome;
  skippedParamKeys: string[];
  matched: string;
}

function evaluate(row: Row): Scored {
  const ambiguous = row.expected_intent === "ambiguous";
  const res = routeIntent(row.message);
  const handled = res !== null;
  const got = res?.intent ?? null;
  const intentCorrect = handled && (got === row.expected_intent || row.also_acceptable.includes(got as string));
  const viaAcceptable = intentCorrect && got !== row.expected_intent;

  const skippedParamKeys: string[] = [];
  let paramChecked = false;
  let paramCorrect = true;

  if (handled && row.expected_params && Object.keys(row.expected_params).length > 0) {
    for (const [key, expected] of Object.entries(row.expected_params)) {
      const realKeys = PARAM_MAP[key];
      if (!realKeys) {
        skippedParamKeys.push(key);
        continue;
      }
      paramChecked = true;
      const ok = realKeys.some((rk) => paramMatches(key, expected, res?.params?.[rk]));
      if (!ok) paramCorrect = false;
    }
  }

  const outcome: Outcome = ambiguous
    ? "ambiguous"
    : !handled
      ? "abstained"
      : !intentCorrect
        ? "wrong_intent"
        : paramChecked && !paramCorrect
          ? "right_intent_wrong_params"
          : "correct";

  return {
    row,
    handled,
    got,
    params: res?.params ?? null,
    intentCorrect,
    viaAcceptable,
    paramChecked,
    paramCorrect: paramChecked ? paramCorrect : true,
    outcome,
    skippedParamKeys,
    matched: handled ? matchedPattern(row.message, got as string) : "",
  };
}

// ------------------------------------------------------------------- buckets
interface Bucket {
  n: number;
  scored: number;
  ambiguous: number;
  abstained: number;
  correct: number;
  wrong_intent: number;
  right_intent_wrong_params: number;
  handled: number;
  intentCorrect: number;
}

function bucketOf(rows: Scored[]): Bucket {
  const b: Bucket = {
    n: rows.length,
    scored: 0,
    ambiguous: 0,
    abstained: 0,
    correct: 0,
    wrong_intent: 0,
    right_intent_wrong_params: 0,
    handled: 0,
    intentCorrect: 0,
  };
  for (const r of rows) {
    if (r.outcome === "ambiguous") {
      b.ambiguous++;
      continue;
    }
    b.scored++;
    if (r.outcome === "abstained") b.abstained++;
    else if (r.outcome === "correct") b.correct++;
    else if (r.outcome === "wrong_intent") b.wrong_intent++;
    else if (r.outcome === "right_intent_wrong_params") b.right_intent_wrong_params++;
  }
  b.handled = b.correct + b.wrong_intent + b.right_intent_wrong_params;
  b.intentCorrect = b.correct + b.right_intent_wrong_params;
  return b;
}

const pct = (num: number, den: number): string =>
  den === 0 ? "n/a" : `${((100 * num) / den).toFixed(1)}%`;
const cell = (num: number, den: number): string => `${pct(num, den)} (${num}/${den})`;

// -------------------------------------------------------------------- loading
function loadJsonl(path: URL): Row[] {
  try {
    return Deno.readTextFileSync(path)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row);
  } catch {
    return [];
  }
}

const splitArg = (() => {
  const i = Deno.args.indexOf("--split");
  const v = i !== -1 ? Deno.args[i + 1] : "all";
  return ["dev", "dev2", "control", "probe", "test", "all"].includes(v) ? v : "all";
})();

const mainRows = loadJsonl(new URL("./router_eval.jsonl", import.meta.url));
const testRows = loadJsonl(new URL("./router_test.jsonl", import.meta.url));
const allRows = [...mainRows, ...testRows];
const chosen = splitArg === "all" ? allRows : allRows.filter((r) => r.split === splitArg);
const scored = chosen.map(evaluate);

const bySplit: Record<string, Scored[]> = {};
for (const r of scored) (bySplit[r.row.split] ??= []).push(r);

let commit = "unknown";
try {
  const out = new Deno.Command("git", { args: ["rev-parse", "HEAD"], stdout: "piped" }).outputSync();
  commit = new TextDecoder().decode(out.stdout).trim();
} catch { /* not a git checkout */ }

// ------------------------------------------------------------------ reporting
const out: string[] = [];
const say = (s = "") => out.push(s);

const fmtParams = (v: unknown): string => {
  if (v == null) return "—";
  if (typeof v === "object" && Object.keys(v as Record<string, unknown>).length === 0) return "—";
  return JSON.stringify(v);
};

function printSplit(name: string, rs: Scored[], perRow: boolean) {
  const b = bucketOf(rs);
  say(`=== ${name} ===`);
  say(`  rows=${b.n}  scored=${b.scored}  ambiguous=${b.ambiguous}  handled=${b.handled}`);
  say(`  outcomes: abstained=${b.abstained}  correct=${b.correct}  wrong_intent=${b.wrong_intent}  right_intent_wrong_params=${b.right_intent_wrong_params}`);
  say(`  coverage (handled by rule)       : ${cell(b.handled, b.scored)}`);
  say(`  rule precision (correct intent)  : ${cell(b.intentCorrect, b.handled)}`);
  say(`  intent+params accuracy           : ${cell(b.correct, b.handled)}`);
  say(`  correct ONLY via also_acceptable : ${rs.filter((r) => r.viaAcceptable).length}`);

  if (perRow) {
    say("");
    say("  id | expected_intent | actual_intent | expected_params | actual_params | outcome | also_acc");
    for (const r of rs) {
      const actual = r.handled ? `rule/${r.got}` : "AI/(abstained)";
      const outcome = r.outcome === "ambiguous" ? "ambiguous (not scored)" : r.outcome;
      say(`  ${String(r.row.id).padStart(2)} | ${r.row.expected_intent} | ${actual} | ${fmtParams(r.row.expected_params)} | ${fmtParams(r.params)} | ${outcome} | ${r.viaAcceptable ? "YES" : "no"}`);
    }
  }
  say("");
}

function tagRows(rows: Scored[], tag: string): Scored[] {
  return rows.filter((r) => (r.row.tags ?? []).includes(tag));
}

function tagReport(rows: Scored[]) {
  const TAG_ORDER = ["typo", "slang", "hinglish", "esl", "indirect", "hard_negative"];
  say("=== PER TAG (all rows; a row can carry several tags) ===");
  say("  tag | n | scored | abstained | correct | wrong_intent | right_intent_wrong_params | coverage | precision | intent+params");
  for (const tag of TAG_ORDER) {
    const b = bucketOf(tagRows(rows, tag));
    say(`  ${tag.padEnd(13)} | ${String(b.n).padStart(2)} | ${String(b.scored).padStart(2)} | ${String(b.abstained).padStart(2)} | ${String(b.correct).padStart(2)} | ${String(b.wrong_intent).padStart(2)} | ${String(b.right_intent_wrong_params).padStart(2)} | ${cell(b.handled, b.scored).padStart(14)} | ${cell(b.intentCorrect, b.handled).padStart(14)} | ${cell(b.correct, b.handled).padStart(14)}`);
  }
  const untagged = rows.filter((r) => (r.row.tags ?? []).length === 0);
  const b = bucketOf(untagged);
  say(`  ${"(untagged)".padEnd(13)} | ${String(b.n).padStart(2)} | ${String(b.scored).padStart(2)} | ${String(b.abstained).padStart(2)} | ${String(b.correct).padStart(2)} | ${String(b.wrong_intent).padStart(2)} | ${String(b.right_intent_wrong_params).padStart(2)} | ${cell(b.handled, b.scored).padStart(14)} | ${cell(b.intentCorrect, b.handled).padStart(14)} | ${cell(b.correct, b.handled).padStart(14)}`);
  say("");
}

if (splitArg === "dev" || splitArg === "all") printSplit("DEV (headline, rows 1-25)", bySplit["dev"] ?? [], true);
if (splitArg === "dev2" || splitArg === "all") printSplit("DEV2 (seen, friend_1 rows 51-60)", bySplit["dev2"] ?? [], true);
if (splitArg === "control" || splitArg === "all") printSplit("CONTROL", bySplit["control"] ?? [], false);
if (splitArg === "probe" || splitArg === "all") printSplit("PROBE", bySplit["probe"] ?? [], false);
if (splitArg === "test" || splitArg === "all") {
  say("=== TEST (empty until approved) ===");
  say(`  rows=${(bySplit["test"] ?? []).length}`);
  say("");
}

tagReport(allRows.map(evaluate));

const report = out.join("\n");
console.log(report);
console.log(`commit ${commit}`);

// --------------------------------------------------------------- results.json
const ts = new Date().toISOString().replace(/[:.]/g, "-");

function splitSummary(rs: Scored[]) {
  const b = bucketOf(rs);
  return {
    rows: b.n,
    scored: b.scored,
    ambiguous: b.ambiguous,
    outcomes: {
      abstained: b.abstained,
      correct: b.correct,
      wrong_intent: b.wrong_intent,
      right_intent_wrong_params: b.right_intent_wrong_params,
    },
    coverage: { num: b.handled, den: b.scored, pct: pct(b.handled, b.scored) },
    rule_precision: { num: b.intentCorrect, den: b.handled, pct: pct(b.intentCorrect, b.handled) },
    intent_params_accuracy: { num: b.correct, den: b.handled, pct: pct(b.correct, b.handled) },
    also_acceptable_rescued: rs.filter((r) => r.viaAcceptable).length,
  };
}

const resultsPath = new URL(`./results_${ts}.json`, import.meta.url);
Deno.writeTextFileSync(resultsPath, JSON.stringify({
  commit,
  generated_at: new Date().toISOString(),
  split_arg: splitArg,
  by_split: Object.fromEntries(
    ["dev", "dev2", "control", "probe", "test"].map((sp) => [sp, splitSummary(bySplit[sp] ?? [])]),
  ),
  detail: scored.map((r) => ({
    id: r.row.id,
    split: r.row.split,
    message: r.row.message,
    expected_intent: r.row.expected_intent,
    also_acceptable: r.row.also_acceptable,
    expected_params: r.row.expected_params,
    tags: r.row.tags ?? [],
    noise_types: r.row.noise_types,
    source: r.row.source,
    handled: r.handled,
    got: r.got,
    params: r.params,
    intent_correct: r.intentCorrect,
    via_acceptable: r.viaAcceptable,
    param_correct: r.paramChecked ? r.paramCorrect : null,
    outcome: r.outcome,
    matched_pattern: r.matched,
  })),
}, null, 2));
console.log(`\nwrote ${resultsPath.pathname.split("/").pop()}`);
