// Read-only per-row detail for the rule layer.
// Runs routeIntent on every row in eval/router_eval.jsonl, writes
// eval/per_row_<timestamp>.md and prints the control/probe table + param audit.
// No AI, no DB, no writes to app code.

import { routeIntent } from "../supabase/functions/_shared/agent-router.ts";

interface Row {
  id: number; message: string; expected_intent: string; also_acceptable: string[];
  expected_params: Record<string, string> | null; noise_types: string[]; split: string;
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function singularWord(w: string): string {
  return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}
function canonPlain(v: unknown): string { return norm(v).split(" ").map(singularWord).join(" "); }
function canonCategory(v: unknown): string {
  const s = canonPlain(v);
  return s === "saloon" ? "salon" : s;
}
function paramMatches(key: string, expected: string, got: unknown): boolean {
  if (got === null || got === undefined) return false;
  return key === "category" ? canonCategory(expected) === canonCategory(got) : canonPlain(expected) === canonPlain(got);
}

const PARAM_MAP: Record<string, string[]> = {
  campaign_name: ["campaignName"], category: ["category"], location: ["city", "country"],
};
// Which plain-English params the code path for each intent is *designed* to extract.
const EXTRACTS: Record<string, string[]> = {
  find_contacts: ["category", "location", "company"],
  pause_campaign: ["campaign_name"],
  create_campaign_draft: ["campaign_name"],
  add_contacts_to_campaign: ["campaign_name"],
};
const NEVER_CAMPAIGN_NAME = ["list_campaigns", "campaign_stats", "suggest_targeting", "find_contacts", "compliance_check", "sender_health"];

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

interface Eval {
  row: Row; handled: boolean; got: string | null; params: Record<string, unknown> | null;
  intentOk: boolean; viaAcceptable: boolean; paramsOk: boolean; paramChecked: boolean;
  bothOk: boolean; matched: string;
}

function evaluate(row: Row): Eval {
  const res = routeIntent(row.message);
  const handled = res !== null;
  const got = res?.intent ?? null;
  const intentOk = handled && (got === row.expected_intent || row.also_acceptable.includes(got as string));
  const viaAcceptable = intentOk && got !== row.expected_intent;
  let paramChecked = false, paramsOk = true;
  if (handled && row.expected_params && Object.keys(row.expected_params).length) {
    for (const [k, exp] of Object.entries(row.expected_params)) {
      const real = PARAM_MAP[k];
      if (!real) continue;
      paramChecked = true;
      if (!real.some((rk) => paramMatches(k, exp, res?.params?.[rk]))) paramsOk = false;
    }
  }
  return {
    row, handled, got, params: res?.params ?? null, intentOk, viaAcceptable,
    paramsOk: paramChecked ? paramsOk : true, paramChecked,
    bothOk: intentOk && (paramChecked ? paramsOk : true),
    matched: handled ? matchedPattern(row.message, got as string) : "",
  };
}

const raw = Deno.readTextFileSync(new URL("./router_eval.jsonl", import.meta.url));
const rows: Row[] = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
const evals = rows.map(evaluate);

const yesNo = (b: boolean, amb: boolean) => amb ? "n/a" : (b ? "yes" : "no");
const paramsCell = (e: Eval) => {
  if (e.row.expected_intent === "ambiguous") return "n/a";
  if (!e.row.expected_params) return "n/a";
  if (!e.handled) return "no (AI)";
  return e.paramsOk ? "yes" : "no";
};

// ---------------------------------------------------------------- markdown
const md: string[] = [];
md.push(`# Per-row rule-layer detail`);
md.push(`Generated ${new Date().toISOString()}`);
md.push("");
md.push("| id | split | message | expected_intent | got | matched trigger | expected_params | params routeIntent returned | intent ok? | params ok? |");
md.push("|---|---|---|---|---|---|---|---|---|---|");
for (const e of evals) {
  const amb = e.row.expected_intent === "ambiguous";
  const got = e.handled ? `rule/${e.got}` : "AI/(null)";
  const exp = e.row.expected_params ? JSON.stringify(e.row.expected_params) : "none";
  const gotParams = e.handled ? JSON.stringify(e.params) : "—";
  md.push(`| ${e.row.id} | ${e.row.split} | ${e.row.message} | ${e.row.expected_intent} | ${got} | ${e.handled ? e.matched : "—"} | ${exp} | ${gotParams} | ${yesNo(e.intentOk, amb)} | ${paramsCell(e)} |`);
}
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const mdPath = new URL(`./per_row_${ts}.md`, import.meta.url);
Deno.writeTextFileSync(mdPath, md.join("\n") + "\n");
console.log(md.join("\n"));

// ------------------------------------------------- control + probe table
function table(split: string) {
  const rs = evals.filter((e) => e.row.split === split);
  console.log(`\n=== ${split.toUpperCase()} (${rs.length} rows) ===`);
  console.log("id | message | expected_intent | got | matched | expected_params | got_params | intent_ok | params_ok");
  for (const e of rs) {
    const amb = e.row.expected_intent === "ambiguous";
    const got = e.handled ? `rule/${e.got}` : "AI/(null)";
    console.log(`${e.row.id} | ${e.row.message} | ${e.row.expected_intent} | ${got} | ${e.handled ? e.matched : "—"} | ${e.row.expected_params ? JSON.stringify(e.row.expected_params) : "none"} | ${e.handled ? JSON.stringify(e.params) : "—"} | ${yesNo(e.intentOk, amb)} | ${paramsCell(e)}`);
  }
}
table("control");
table("probe");

// --------------------------------------------- params-not-ok audit
const supports = (intent: string, key: string) => (EXTRACTS[intent] ?? []).includes(key);
console.log("\n=== ROWS WITH PARAMS NOT OK ===");
let count = 0;
for (const e of evals) {
  if (e.row.expected_intent === "ambiguous") continue;
  if (!e.row.expected_params) continue;
  if (e.handled && e.paramChecked && e.paramsOk) continue;
  count++;
  console.log(`  #${e.row.id} [${e.row.split}] expected=${e.row.expected_intent} got=${e.handled ? e.got : "AI/(null)"}`);
  console.log(`     expected=${JSON.stringify(e.row.expected_params)}  got=${e.handled ? JSON.stringify(e.params) : "—"}`);
  for (const key of Object.keys(e.row.expected_params)) {
    const real = PARAM_MAP[key];
    const keyOk = e.handled && !!real && real.some((rk) => paramMatches(key, e.row.expected_params![key], e.params?.[rk]));
    if (keyOk) continue;
    const expSup = supports(e.row.expected_intent, key);
    if (!e.handled) {
      console.log(`     ${key}: ${expSup
        ? `expected path (${e.row.expected_intent}) DOES extract it, but the rule never matched → coverage miss, extraction never ran.`
        : `expected path (${e.row.expected_intent}) does NOT extract it (returns no params for this key).`}`);
    } else if (e.got === e.row.expected_intent) {
      console.log(`     ${key}: ${expSup
        ? `SUPPOSED to extract — code path exists; returned the wrong value.`
        : `NOT supposed to extract — the ${e.row.expected_intent} branch returns no params for this key.`}`);
    } else {
      const gotSup = supports(e.got as string, key);
      console.log(`     ${key}: intent mismatch (got ${e.got}). Expected ${e.row.expected_intent} ${expSup ? "does" : "does not"} extract it; the matched ${e.got} ${gotSup ? "does try and gets it wrong" : "does not extract it"}.`);
    }
  }
}
console.log(`\ntotal rows with params not ok: ${count}`);

console.log("\n=== INTENTS THAT NEVER RETURN campaignName ===");
console.log(NEVER_CAMPAIGN_NAME.join(", "));
console.log("\n(intents that DO return campaignName: pause_campaign, add_contacts_to_campaign, create_campaign_draft)");

let commit = "unknown";
try {
  const out = new Deno.Command("git", { args: ["rev-parse", "HEAD"], stdout: "piped" }).outputSync();
  commit = new TextDecoder().decode(out.stdout).trim();
} catch { /* no git */ }
console.log(`\ncommit ${commit}`);
console.log(`wrote ${mdPath.pathname.split("/").pop()}`);
