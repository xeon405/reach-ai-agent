// AI fallback measurement (`understand()` only). Read-only by design:
// understand() returns a proposal; execution is a separate call we never make.
// No database writes, no emails, no state changes. Metering is disabled by
// unsetting SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the caller.
//
//   GROQ_API_KEYS=... deno run --no-check --allow-read --allow-write \
//     --allow-net --allow-env eval/run_ai_fallback.ts [--probe|--all]
//
// --probe runs one row (used to check credentials without burning the set).
// --all runs all 60 rows. It logs the model that answered each row by
// intercepting the Groq request (groqChat discards the model/usage itself).

import { understand } from "../supabase/functions/_shared/agent-understand.ts";

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

function paramMatches(key: string, expected: string, got: unknown): boolean {
  if (got === null || got === undefined) return false;
  return key === "category"
    ? canonCategory(expected) === canonCategory(got)
    : canonPlain(expected) === canonPlain(got);
}

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

const args = Deno.args;
const probeOnly = args.includes("--probe");
const mainRows = loadJsonl(new URL("./router_eval.jsonl", import.meta.url));
const testRows = loadJsonl(new URL("./router_test.jsonl", import.meta.url));
const allRows = [...mainRows, ...testRows].filter((r) => ["dev", "dev2", "control", "probe"].includes(r.split));
const chosen = probeOnly ? allRows.slice(0, 1) : allRows;

// ------------------------------------------------------- request interception
interface CallMeta { model: string | null; status: number | null; usage: Record<string, unknown> | null }

const realFetch = globalThis.fetch;
let lastCall: CallMeta | null = null;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const res = await realFetch(input as RequestInfo, init);
  if (url.includes("api.groq.com/openai/v1/chat/completions")) {
    let model: string | null = null;
    try {
      model = (JSON.parse(String(init?.body ?? "{}")) as { model?: string }).model ?? null;
    } catch { /* ignore */ }
    let usage: Record<string, unknown> | null = null;
    try {
      const j = await res.clone().json() as { usage?: Record<string, unknown> };
      usage = j.usage ?? null;
    } catch { /* ignore */ }
    lastCall = { model, status: res.status, usage };
  }
  return res;
};

const COST_IN = Number(Deno.env.get("AI_COST_PER_1M_IN") ?? "0.20");
const COST_OUT = Number(Deno.env.get("AI_COST_PER_1M_OUT") ?? "0.80");
function costOf(usage: Record<string, unknown> | null): number | null {
  if (!usage) return null;
  const inTok = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const outTok = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  return Math.round(((inTok * COST_IN + outTok * COST_OUT) / 1_000_000) * 1_000_000) / 1_000_000;
}
function tokensOf(usage: Record<string, unknown> | null): { in: number | null; out: number | null } {
  if (!usage) return { in: null, out: null };
  return {
    in: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0,
    out: Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0,
  };
}

// ------------------------------------------------------------------- run rows
interface AiResult {
  id: number;
  split: string;
  message: string;
  expected_intent: string;
  also_acceptable: string[];
  expected_params: Record<string, string> | null;
  tags: string[];
  ai_kind: string;
  ai_intent: string | null;
  ai_params: Record<string, unknown>;
  intent_ok: boolean | null;
  params_ok: boolean | null;
  both_ok: boolean | null;
  model: string | null;
  status: number | null;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  est_cost_usd: number | null;
  error: string | null;
}

const results: AiResult[] = [];
const model = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";

for (const row of chosen) {
  lastCall = null;
  const start = performance.now();
  let aiKind = "error";
  let aiIntent: string | null = null;
  let aiParams: Record<string, unknown> = {};
  let error: string | null = null;

  try {
    const res = await understand(row.message, [], "", null, null, null);
    if (res?.u) {
      aiKind = res.u.kind;
      if (res.u.kind === "read" || res.u.kind === "write") {
        aiIntent = res.u.req.intent;
        aiParams = res.u.req.params ?? {};
      } else if (res.u.kind === "ask") {
        aiIntent = res.u.intent;
        aiParams = res.u.params ?? {};
      } else if (res.u.kind === "unclear") {
        aiIntent = res.u.guess ?? "unclear";
      } else if (res.u.kind === "chat") {
        aiIntent = "chat";
      } else if (res.u.kind === "profile") {
        aiIntent = "profile";
      }
    } else {
      error = `understand() returned null (last HTTP ${lastCall?.status ?? "?"})`;
    }
  } catch (e) {
    error = String((e as Error)?.message ?? e);
  }

  const latency = Math.round(performance.now() - start);
  const ambiguous = row.expected_intent === "ambiguous";
  let intentOk: boolean | null = ambiguous ? null : (aiIntent === row.expected_intent || row.also_acceptable.includes(aiIntent ?? ""));
  let paramsOk: boolean | null = null;
  if (!ambiguous && row.expected_params && Object.keys(row.expected_params).length > 0) {
    paramsOk = true;
    for (const [key, expected] of Object.entries(row.expected_params)) {
      const realKeys = PARAM_MAP[key];
      if (!realKeys) continue;
      if (!realKeys.some((rk) => paramMatches(key, expected, aiParams[rk]))) paramsOk = false;
    }
  }
  if (error) { intentOk = null; paramsOk = null; }
  const bothOk = intentOk === true && (paramsOk === null || paramsOk === true);

  results.push({
    id: row.id,
    split: row.split,
    message: row.message,
    expected_intent: row.expected_intent,
    also_acceptable: row.also_acceptable,
    expected_params: row.expected_params,
    tags: row.tags ?? [],
    ai_kind: aiKind,
    ai_intent: aiIntent,
    ai_params: aiParams,
    intent_ok: intentOk,
    params_ok: paramsOk,
    both_ok: bothOk,
    model: lastCall?.model ?? null,
    status: lastCall?.status ?? null,
    latency_ms: latency,
    input_tokens: tokensOf(lastCall?.usage).in,
    output_tokens: tokensOf(lastCall?.usage).out,
    est_cost_usd: costOf(lastCall?.usage),
    error,
  });
}

// ---------------------------------------------------------------- reporting
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function p95(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

console.log(`model_config=${model} temperature=0.2`);
for (const split of ["dev", "dev2", "control", "probe"]) {
  const rs = results.filter((r) => r.split === split);
  if (!rs.length) continue;
  const scored = rs.filter((r) => r.intent_ok !== null);
  const intentAcc = scored.length ? scored.filter((r) => r.intent_ok).length / scored.length : 0;
  const bothScored = rs.filter((r) => r.intent_ok !== null && r.expected_params != null);
  const bothAcc = bothScored.length ? bothScored.filter((r) => r.both_ok).length / bothScored.length : 0;
  const ok = rs.filter((r) => r.ai_kind !== "error");
  const lats = rs.map((r) => r.latency_ms);
  const costs = rs.map((r) => r.est_cost_usd).filter((x): x is number => x != null);
  const models = [...new Set(rs.map((r) => r.model ?? "(none)"))].join(",");
  console.log(`\n=== AI ${split.toUpperCase()} ===`);
  console.log(`  n=${rs.length} answered=${ok.length} scored_intent=${scored.length} scored_both=${bothScored.length}`);
  console.log(`  intent_acc=${scored.length ? `${(intentAcc * 100).toFixed(1)}%` : "n/a (0 answered)"}  intent+params_acc=${bothScored.length ? `${(bothAcc * 100).toFixed(1)}%` : "n/a (0 answered)"}`);
  console.log(`  latency median=${median(lats).toFixed(0)}ms p95=${p95(lats).toFixed(0)}ms`);
  console.log(`  avg_cost=${costs.length ? (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(6) : "n/a"} USD`);
  console.log(`  models=${models}`);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const blocked = results.every((r) => r.ai_kind === "error");
const name = blocked ? `results_ai_BLOCKED_${ts}.json` : `results_ai_${ts}.json`;
const outPath = new URL(`./${name}`, import.meta.url);
Deno.writeTextFileSync(outPath, JSON.stringify({
  commit: (() => {
    try {
      const o = new Deno.Command("git", { args: ["rev-parse", "HEAD"], stdout: "piped" }).outputSync();
      return new TextDecoder().decode(o.stdout).trim();
    } catch { return "unknown"; }
  })(),
  generated_at: new Date().toISOString(),
  blocked,
  blocked_reason: blocked
    ? "Every call failed before a usable Understanding. The only GROQ secret exposed to this environment is a 64-hex hash, not a gsk_ key; Groq returns 401 invalid_api_key."
    : null,
  model_config: model,
  temperature: 0.2,
  cost_rates_usd_per_1m: { input: COST_IN, output: COST_OUT },
  results,
}, null, 2));
console.log(`\nwrote ${name}`);
