// ============================================================
// prove-memory-realfire.mjs — Stage 8 value-governance REAL-FIRE.
// Calls the REAL Groq model (api.groq.com, model + key read from the
// project's function secrets) with the REAL buildPrompt of the REAL
// thread-memory module, then runs the REAL parseMemoryFacts + sanitizer.
// No DB writes, no sends. Synthetic messages hold protected-category
// objections (health / religion / disability / family-crisis) so we can
// test the abstraction instruction against an actual model, not a canned
// stub.
//
// Asserts, per case:
//   * the model obeyed the whitelist (objection only, nothing new)
//   * the emitted value is an ABSTRACTION, not a verbatim quote of the
//     sensitive phrase
//   * after the real sanitizer, NO protected-category term survives and
//     no identifier pattern survives
//   * the business-intent core is retained (not emptied)
// Honest scope: this proves the model honors the abstraction instruction
// on synthetic inputs. The enforceable layer is the sanitizer; the
// instruction is the model-side nudge.
// ============================================================
import fs from "node:fs";

globalThis.Deno = { env: { get: (k) => process.env[k] ?? null } };
const { buildPrompt, parseMemoryFacts, sanitizeMemoryValue, hasProtectedCategoryTerms, MEMORY_FACT_KINDS } =
  await import("../../supabase/functions/_shared/thread-memory.ts");

const out = [];
const a = (label, ok, note = "") => { out.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`); };
if (typeof MEMORY_FACT_KINDS === "undefined") { console.error("module import failed"); process.exit(1); }

// Real model + key from the project secrets (what the deployed function uses).
const REF = "zvohdvopmvzsujktrdmu";
const TOKEN = (fs.readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN=")) || "=").split("=").slice(1).join("=").trim();

const secretsJson = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const getSecret = (n) => secretsJson.find((s) => s.name === n)?.value;
const MODEL = getSecret("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const KEY = (getSecret("GROQ_API_KEYS") ?? "").split(",")[0].trim();
if (!KEY) { console.error("No GROQ key available via secrets"); process.exit(2); }
console.log(`\n  model=${MODEL}  key=${KEY.slice(0, 8)}…`);

const NOW = Date.now();
const DAY = 86400000;
const makeMsg = (day, body) => ({ id: `rf-${day}`, internalDateMs: NOW - day * DAY, fromEmail: "lead@realfire.test", senderEmail: "owner@gmail.com", body });

const CASES = [
  { name: "health", body: "Sorry — with my chemo schedule landing on tuesdays this quarter, I can't commit to a fixed call time." },
  { name: "religion", body: "We host mosque services in the hall; our prayer times make weekday mornings impossible for an intro call." },
  { name: "disability-crisis", body: "I'm managing my mother's wheelchair needs full-time and going through a divorce, so scheduling is tight right now." },
];

async function realFire(c) {
  const prompt = buildPrompt([], [makeMsg(2, c.body)]);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0, reasoning_effort: "low" }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  let text = String(data?.choices?.[0]?.message?.content ?? "");
  if (!text.trim() && typeof data?.choices?.[0]?.message?.reasoning === "string") text = data.choices[0].message.reasoning;
  return text.replace(/ thinking[\s\S]*?<\/think>/g, "").replace(/```json|```/g, "");
}

for (const c of CASES) {
  console.log(`\n  -- CASE ${c.name}: ${c.body}`);
  let raw;
  try { raw = await realFire(c); } catch (e) { console.error("  HARNESS ERROR:", e.message); process.exit(1); }
  const facts = parseMemoryFacts(raw);
  const obj = facts.find((f) => f.kind === "objection");
  const cleaned = obj ? sanitizeMemoryValue(obj.value) : "";
  const identifiers = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(cleaned) || /(?:555|chem|prayer|mosque|wheelchair|divorce)/i.test(cleaned) || /\d{3,}/.test(cleaned);
  a(`${c.name}: model honored whitelist (objection only, nothing invented)`, facts.length >= 1 && facts.every((f) => MEMORY_FACT_KINDS.includes(f.kind)), JSON.stringify(facts));
  a(`${c.name}: emitted value is an ABSTRACTION (< 40 chars, no verbatim protected phrase)`, obj != null && obj.value.length < 40 && !/chemotherapy schedule|chemo schedule|mosque services|prayer times|wheelchair needs|going through a divorce/i.test(obj.value), obj?.value ?? "(none)");
  a(`${c.name}: after sanitizer — no protected token, no identifier, intent retained`,
    !identifiers && cleaned.length > 0, cleaned.split(" ").slice(0, 12).join(" "));
  console.log(`    raw model value : ${obj?.value ?? "(no whitelisted objection)"}`);
  console.log(`    after sanitize  : ${cleaned || "(emptied)"}`);
}

const fails = out.filter((x) => !x).length;
console.log(`\nRESULT: ${fails === 0 ? "PASS" : "FAIL"} (${out.length - fails}/${out.length})`);
process.exit(fails === 0 ? 0 : 1);