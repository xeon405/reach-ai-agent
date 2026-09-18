// ============================================================
// THREAD-MEMORY — the durable memory writer (Stage 8, §8.5/§8.6).
// Produces facts from a Gmail thread slice into thread_memory,
// routed through the ai-cost-gate with kind `summarize` (an L1,
// non-reply kind: trips on the daily pool + metering_degraded).
//
// Semantics (SETTLED 2026-09-09, user-confirmed):
//   * STRICT-INCREMENTAL slice: only messages with
//     internalDate > coalesce(last_summarized_at, forget_at, 0),
//     capped to the newest N per scan. The watermark is the single
//     processing checkpoint.
//   * CONSERVE = skip-and-leave-unchanged: when the gate refuses
//     (mode !== 'ai') or the debit trips / LLM fails, NOTHING is
//     written and last_summarized_at does NOT advance — so a return
//     to ai mode re-processes exactly the same skipped slice.
//   * Watermark advances only on a successful gated call over a
//     non-empty slice (advance to the newest sliced message), even
//     if zero facts pass the whitelist: the slice was processed.
//   * Existing non-superseded facts are passed as model context so a
//     later slice can SUPERSEDE an outdated fact (replace-not-append,
//     via superseded_at) rather than duplicate or ignore it. Same
//     kind + same value => no-op (never re-inserted).
//   * Whitelist is enforced HERE (parser drops any kind outside the
//     schema whitelist) AND at the schema CHECK; value <= 200 chars
//     both enforced here; per-thread active-fact cap (64) enforced
//     here (schema cannot count cheaply).
//   * forget_at is a hard lower bound: internalDate == forget_at is
//     EXCLUDED (strict >). Re-extraction of pre-boundary content is
//     structurally impossible.
//
// Module is Node-testable: only (structural db, global fetch) and
// imports ai-cost-gate.ts (also Node-clean). No deno_land imports.
// ============================================================

import { openAiCall } from "./ai-cost-gate.ts";
import { resolveScopedSwitch } from "./agent-config.ts";

export const MEMORY_FACT_KINDS = [
  "interest_level",
  "objection",
  "timing_window",
  "availability",
  "decision_criteria",
  "contact_role",
  "next_action",
  "commitment",
] as const;

export type MemoryFactKind = (typeof MEMORY_FACT_KINDS)[number];

export const MEMORY_MAX_ACTIVE_FACTS = 64;
export const MEMORY_MAX_VALUE_CHARS = 200;
export const MEMORY_SCAN_CAP = 8;

export interface MemoryMessage {
  id: string;
  internalDateMs: number;
  /** lower-cased raw From header (matches lead email). */
  fromEmail: string;
  /** lower-cased sender (owner's gmail) used to label the side. */
  senderEmail: string;
  subject?: string;
  body: string;
}

export interface MemoryThreadCtx {
  userId: string;
  campaignId?: string | null;
  leadId: string;
  plan?: string | null;
}

export interface MemoryWriteOutcome {
  action: "no_thread" | "nothing_new" | "conserve" | "written";
  reason?: string;
  mode?: string;
  /** The message ids that are (or would be) summarized this scan. */
  sliceIds: string[];
  written: number;
  superseded: number;
  duplicate: number;
  dropped: number;
  watermarkMs?: number;
}

type Db = { from: (table: string) => any; rpc: (fn: string, args: any) => any };

type ThreadRow = { id: string; forget_at: string | null; last_summarized_at: string | null };

export function ms(v: string | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function labelFor(fromEmail: string, senderEmail: string): string {
  const f = String(fromEmail || "").toLowerCase();
  const s = String(senderEmail || "").toLowerCase();
  return f.includes(s) && s ? "You" : "Lead";
}

/** Format the thread's existing active (non-superseded) facts for model context. */
export function formatFactsForPrompt(rows: Array<{ fact_kind: string; value: string }>): string {
  if (!rows.length) return "";
  return rows.map((r) => `- ${r.fact_kind}: ${r.value}`).join("\n");
}

export async function memoryFactsFor(
  db: Db,
  threadId: string,
): Promise<Array<{ fact_kind: string; value: string; id: string }>> {
  const { data } = await db
    .from("thread_memory")
    .select("id, fact_kind, value")
    .eq("thread_id", threadId)
    .is("superseded_at", null);
  return (data ?? []) as Array<{ fact_kind: string; value: string; id: string }>;
}

/** Active-fact context block for prompts, keyed by lead (covers all threads). */
export async function memoryContextFor(db: Db, leadId: string): Promise<string> {
  try {
    const { data } = await db
      .from("thread_memory")
      .select("fact_kind, value")
      .eq("lead_id", leadId)
      .is("superseded_at", null);
    return formatFactsForPrompt((data ?? []) as Array<{ fact_kind: string; value: string }>);
  } catch {
    return "";
  }
}

/**
 * Protected-category term screen — the pattern backstop for prose-without-
 * identifiers. The kind whitelist + identifier stripping cover category and
 * numeric direct-identifiers; this covers personal protected-context vocabulary
 * ("chemo schedule", "prayer times", "wheelchair access", "going through a
 * divorce") that has no numeric pattern. Heuristic keyword/phrase coverage of the
 * OBVIOUS cases (not NLP): matching text is replaced by the generic marker
 * "[personal]" so the business-intent remainder survives and the protected
 * context cannot persist. Deliberately excludes industry-ambiguous words
 * (hospital, church, therapy, temple-as-business…) so a legitimately
 * healthcare/faith-sector lead's decision facts are not mangled — abstraction of
 * sensitive content is the prompt's job; this screen is the enforceable floor for
 * unambiguous personal/life-event vocabulary.
 */
const MEMORY_PROTECTED_PATTERNS = [
  /\bchemo(?:ther\w*)?\b|\bcancer(?:ous)?\b|\btumou?r\b|\boncolog\w*|\bdialysis\b|\btransplant\b|\bhospic\w*|\bpalliative\b|\bprescription\w*|\bpsychiatr\w*|\brehabilitat\w*|\bmiscarriage\b|\bstillborn\b|\bamputat\w*\b|\bprosthes\w*\b/gi,
  /\bmosque\b|\bsynagogue\b|\bbible\b|\bqur'?an\b|\bkoran\b|\btorah\b|\bgospel\b|\bpriest\b|\bimam\b|\brabbi\b|\bpastor\b|\bprayer\w*\b|\bsabbath\b|\bramadan\b|\bhajj\b|\bpilgrimage\b/gi,
  /\bwheelchair\b|\bhearing-?impair\w*\b|\bvisually-?impair\w*\b|\bdown syndrome\b|\bcerebral pals\w*\b|\bintellectual disabilit\w*\b|\bmobility-?impair\w*\b/gi,
  /\bdivorce\w*\b|\bcustody\b|\bbereavement\b|\bfuneral\w*\b|\bdomestic viol\w*\b|\brestraining order\b|\bhomeless\w*\b/gi,
] as const;

/**
 * Value governance — code-level backstop on the free-text `value` (the kind
 * whitelist protects the CATEGORY; this protects the CONTENT).
 * The prompt instructs the model to abstract intent; this prunes the direct
 * identifiers a model could still echo (emails, phone numbers, account/order-
 * long digit runs, exact $ figures) and screens protected-category personal
 * vocabulary, so a verbatim quote can never persist as-is.
 * Keeps the generalized remainder (the business intent), never rewrites prose
 * into a token — a value that becomes empty after pruning is dropped upstream.
 */
export function sanitizeMemoryValue(raw: string): string {
  let v = String(raw ?? "").trim();
  v = v
    .replace(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi, " ")
    .replace(/(?:\+?\d[\d\s().\-]{6,}\d|\b\d{3}[-.)\s]\d{3}[-.)\s]\d{4}\b)/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, " ")
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  v = MEMORY_PROTECTED_PATTERNS.reduce((acc, re) => acc.replace(re, " [personal] "), v);
  v = v.replace(/\s+/g, " ").trim();
  return v.slice(0, MEMORY_MAX_VALUE_CHARS);
}

/** Whether a value still carries protected-category vocabulary (for tests/monitors). */
export function hasProtectedCategoryTerms(v: string): boolean {
  return MEMORY_PROTECTED_PATTERNS.some((re) => re.test(String(v ?? "")));
}

/** Parser: STRICT, whitelisted, truncated, identifier + protected-category pruned. Never throws on model garbage. */
export function parseMemoryFacts(raw: string): Array<{ kind: string; value: string; confidence: number }> {
  const out: Array<{ kind: string; value: string; confidence: number }> = [];
  let text = String(raw ?? "").trim();
  try {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.facts) ? obj.facts : [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const kind = String(item.kind ?? "").trim();
      if (!MEMORY_FACT_KINDS.includes(kind as MemoryFactKind)) continue; // whitelist gate
      const value = sanitizeMemoryValue(String(item.value ?? "").trim());
      if (!value) continue;
      let conf = Number(item.confidence);
      if (!Number.isFinite(conf)) conf = 0.7;
      out.push({ kind, value, confidence: Math.min(1, Math.max(0, conf)) });
    }
  } catch {
    /* unparseable => no facts; the slice is still considered processed */
  }
  return out;
}

export function buildPrompt(
  existing: Array<{ fact_kind: string; value: string }>,
  slice: MemoryMessage[],
): string {
  const existingBlock = formatFactsForPrompt(existing);
  const lines = slice.map(
    (m) => `[${new Date(m.internalDateMs).toISOString()}] ${labelFor(m.fromEmail, m.senderEmail)}: ${m.body}`,
  );
  return [
    "You are the durable memory extractor for a solo business owner's outreach system.",
    "Extract ONLY durable business facts from the NEW messages below.",
    "Allowed kinds (STRICT — never invent a new kind): " + MEMORY_FACT_KINDS.join(", ") + ".",
    "Forbidden: personal/sensitive topics (family, health, politics, religion, identity beyond professional role),",
    "inference beyond the text, speculative preferences. If a fact is already in EXISTING MEMORY and is still",
    "true, DO NOT re-emit it. If a NEW message changes an existing fact, emit the kind again with the new value",
    "(this supersedes the old row). Never emit raw message text.",
    "VALUE GOVERNANCE: paraphrase intent, never quote a message verbatim. If a message states a sensitive-",
    "adjacent detail (a stated reason, pricing headroom, budget, timeline constraints), ABSTRACT it into the",
    "business-relevant essence (e.g. 'budget-constrained', 'cost-sensitive', 'needs internal approval') — never",
    "echo the original phrasing or figures. Never emit direct identifiers: emails, phone numbers, full addresses,",
    "account/order/card numbers, or exact $ amounts (a rounded range is allowed only when it is decision-relevant).",
    "Values must be generalizable statements a future conversation benefits from — typically 3-12 words.",
    "Respond with STRICT JSON only, no prose: {\"facts\":[{\"kind\":\"<one of the allowed kinds>\",",
    "\"value\":\"<short, <=200 chars, business-relevant>\",\"confidence\":0..1}]}",
    "",
    "EXISTING MEMORY (active facts for this thread):",
    existingBlock || "(none)",
    "",
    "NEW MESSAGES (newest last) — summarize these:",
    ...lines,
  ].join("\n");
}

export async function summarizeThreadMemory(
  db: Db,
  ctx: MemoryThreadCtx,
  fetchMessages: (threadId: string, tok: string) => Promise<MemoryMessage[]>,
  opts: {
    token: string;
    threadId: string | null;
    senderEmail: string;
    groqChat: (m: Array<{ role: string; content: string }>, o?: any) => Promise<string>;
  },
): Promise<MemoryWriteOutcome> {
  const no = (action: MemoryWriteOutcome["action"], reason?: string, extra: Partial<MemoryWriteOutcome> = {}): MemoryWriteOutcome =>
    ({ action, reason, sliceIds: [], written: 0, superseded: 0, duplicate: 0, dropped: 0, ...extra });

  if (!opts.threadId) return no("no_thread", "no_gmail_thread");

  // Thread row = per-(user, lead) unit; carries forget_at + watermark.
  let threadRow: ThreadRow | null = null;
  try {
    const { data } = await db
      .from("email_threads")
      .select("id, forget_at, last_summarized_at")
      .eq("user_id", ctx.userId)
      .eq("lead_id", ctx.leadId)
      .maybeSingle();
    threadRow = data as ThreadRow | null;
  } catch {
    return no("no_thread", "thread_read_failed");
  }
  if (!threadRow) return no("no_thread", "no_thread_row");

  // Dedicated capability kill-switch, independent of the cost conserve marker:
  // off => no Gmail fetch, no gate call, no debit, no write. Does not affect
  // other call sites (replies/personalization never consult this key).
  if (!(await resolveScopedSwitch(db, "memory_builder.enabled", { userId: ctx.userId, campaignId: ctx.campaignId ?? null }))) {
    return no("conserve", "kill_switch", { mode: "template" });
  }

  const boundMs = Math.max(ms(threadRow.forget_at), ms(threadRow.last_summarized_at), 0);

  let all: MemoryMessage[] = [];
  try {
    all = (await fetchMessages(opts.threadId, opts.token)) ?? [];
  } catch {
    return no("conserve", "gmail_fetch_failed"); // never write memory on unknown boundary
  }
  const slice = all
    .filter((m) => Number(m.internalDateMs) && m.internalDateMs > boundMs)
    .sort((a, b) => a.internalDateMs - b.internalDateMs)
    .slice(-MEMORY_SCAN_CAP);
  const sliceIds = slice.map((m) => m.id);
  if (slice.length === 0) return no("nothing_new", "no_messages_after_watermark", { sliceIds });

  const existing = await memoryFactsFor(db, threadRow.id);
  const existingCtx = existing.map((f) => ({ fact_kind: f.fact_kind, value: f.value }));
  const activeCount = existing.length;

  const gate = await openAiCall(db, {
    userId: ctx.userId,
    campaignId: ctx.campaignId ?? null,
    leadId: ctx.leadId,
    kind: "summarize",
    plan: ctx.plan ?? null,
    fn: "inbox-agent",
    groqChat: opts.groqChat,
  });

  if (gate.mode !== "ai") {
    return no("conserve", `gate:${gate.reason ?? gate.mode}`, { sliceIds, mode: gate.mode });
  }
  let raw: string | null = null;
  try {
    raw = await gate.run(buildPrompt(existingCtx, slice), { maxTokens: 700, temperature: 0 });
  } catch {
    raw = null;
  }
  if (!raw) {
    // Debit tripped the ceiling or the LLM failed — same rule as conserve.
    return no("conserve", "debit_or_llm_refused", { sliceIds, mode: "ai" });
  }

  const facts = parseMemoryFacts(raw);
  const newWatermark = slice[slice.length - 1].internalDateMs;

  // Replace-not-append: supersede any active fact whose kind changes value;
  // skip (dedupe) any active fact whose kind+value already matches.
  const activeByKind = new Map(existing.map((f) => [f.fact_kind, f.value]));
  let superseded = 0;
  let duplicate = 0;
  const droppedFromCap = Math.max(0, facts.length - Math.max(0, MEMORY_MAX_ACTIVE_FACTS - activeCount));
  const toInsert = facts.slice(0, Math.max(0, MEMORY_MAX_ACTIVE_FACTS - activeCount));
  for (const f of toInsert) {
    const prev = activeByKind.get(f.kind);
    if (prev !== undefined) {
      if (prev === f.value) { duplicate++; continue; }
      await db.from("thread_memory").update({ superseded_at: new Date().toISOString() }).eq("thread_id", threadRow.id).eq("fact_kind", f.kind).is("superseded_at", null);
      superseded++;
    }
    await db.from("thread_memory").insert({
      thread_id: threadRow.id,
      lead_id: ctx.leadId,
      fact_kind: f.kind,
      value: f.value,
      source_message_id: slice[slice.length - 1].id,
      source_ts: new Date(newWatermark).toISOString(),
      confidence: f.confidence,
    });
  }
  // Advance the watermark ONLY after the slice was successfully processed.
  await db.from("email_threads").update({ last_summarized_at: new Date(newWatermark).toISOString() })
    .eq("user_id", ctx.userId).eq("lead_id", ctx.leadId);

  return {
    action: "written",
    reason: facts.length ? "facts_written" : "processed_no_facts",
    sliceIds,
    written: toInsert.length - superseded - duplicate,
    superseded,
    duplicate,
    dropped: droppedFromCap + (facts.length - toInsert.length - Math.max(0, droppedFromCap)),
    watermarkMs: newWatermark,
  };
}