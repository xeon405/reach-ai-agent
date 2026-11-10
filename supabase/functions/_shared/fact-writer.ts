// ============================================================
// FACT WRITER — the only path from facts to a draft email.
//
// The model is asked for JSON, not prose:
//   { "draft": "...", "claims": [{ "sentence": "...", "fact_ids": ["f1"] }] }
//
// Then the code checks it. A sentence that asserts a checkable detail and
// cites no verified fact is removed, and the reason is returned. The model is
// never trusted to grade its own work.
//
// Pure TS except for the prompt string. Parsing and enforcement are testable
// with no network.
// ============================================================

import {
  type Claim,
  type Fact,
  type FactKind,
  type FactSource,
  enforceClaims,
  factsToPromptBlock,
  isPleasantry,
} from "./fact-layer.ts";

export interface WriterOutcome {
  /** The draft that survived enforcement. Empty means: do not send. */
  content: string;
  claims: Claim[];
  blocked: Array<{ sentence: string; reason: string }>;
  facts: Fact[];
  /** True when nothing sourceable survived. The caller must not send. */
  empty: boolean;
}

/** Deterministic ids so a retry cites the same fact the same way. */
export function factsFromLead(
  lead: Record<string, unknown>,
  opts: {
    now?: string;
    listingUrl?: string;
    /** Facts the sender typed themselves: name, company, job title. */
    extra?: Array<{ kind: FactKind; value: unknown; source?: FactSource }>;
  } = {},
): Fact[] {
  const now = opts.now ?? new Date().toISOString();
  const out: Fact[] = [];
  let n = 0;

  const add = (
    kind: FactKind,
    value: unknown,
    url?: string,
    source: FactSource = "listing",
  ) => {
    const v = String(value ?? "").trim();
    if (!v) return;
    n += 1;
    out.push({
      id: `f${n}`,
      kind,
      value: v,
      quote: v,
      sourceUrl: url ?? opts.listingUrl ?? "",
      checkedAt: now,
      source,
    });
  };

  add("name", lead.name);
  add("company", lead.company);
  add("job_title", lead.job_title);
  add("category", lead.category);
  add("city", lead.city);
  add("address", lead.address);
  add("rating", lead.rating);
  add("website", lead.website);
  add("phone", lead.phone);

  for (const e of opts.extra ?? []) {
    add(e.kind, e.value, undefined, e.source ?? "you");
  }

  return out;
}

/** A Google Maps link a human can open to check the listing. Built from the
 *  name, not from an invented place id. */
export function listingUrl(name: unknown, address: unknown): string {
  const q = [name, address].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : "";
}

export function buildFactWriterPrompt(args: {
  facts: Fact[];
  senderName: string;
  senderCompany: string;
  offer: string;
  bookingLink?: string;
  signature?: string;
  arabic?: boolean;
  openerDirective?: string;
}): string {
  const facts = factsToPromptBlock(args.facts);
  return `${facts}

## WHO YOU ARE WRITING FOR
Sender: ${args.senderName || "the sender"} at ${args.senderCompany || "their company"}
Offer: ${args.offer || "their service"}${args.bookingLink ? `\nBooking link: ${args.bookingLink}` : ""}

## THE ONE RULE
Every sentence that states a number, a name, a place, a rating, or anything
about this specific business must cite a fact id from the list above.
If you want to say something and no fact supports it, do not say it.
A shorter true email always beats a richer invented one.

## OUTPUT
Return JSON only, no markdown fence, no commentary:
{"draft":"the email body with real line breaks","claims":[{"sentence":"exact sentence from the draft","fact_ids":["f1"]}]}

Rules for the draft:
- Plain text. Greeting on its own line. Sign off as: Best regards, ${args.senderName || args.senderCompany || "the team"}
- Maximum 90 words. Short sentences. No subject line.
- No placeholders like [Your Name].
- One clear next step, phrased as a question.
- Never claim to have visited, audited, scanned or reviewed their site.
- Never state what they lack, use, or are missing.
- Banned words: free, guarantee, act now, limited time, risk-free, urgent, buy now, cheap, 100%, make money, congratulations.${args.signature ? `\n- End with this signature verbatim:\n${args.signature}` : ""}${args.openerDirective ? `\n\n${args.openerDirective}` : ""}${args.arabic ? `\n\nWrite the draft in Arabic (Gulf business tone). Keep the JSON keys in English; only the draft text is Arabic.` : ""}`;
}

/** Models wrap JSON in fences and sometimes add a sentence before it. Take the
 *  outermost object and reject anything that is not the agreed shape. */
export function parseWriterJson(
  raw: string,
): { draft: string; claims: Claim[]; subject: string } | null {
  const text = String(raw ?? "").replace(/```json/gi, "```").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  // "draft" is the review/preview contract; "body" is the send-worker contract.
  // Both are the same thing: the text of the email.
  const draft = typeof obj.draft === "string"
    ? obj.draft.trim()
    : typeof obj.body === "string"
      ? obj.body.trim()
      : "";
  if (!draft) return null;

  const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";

  const claims: Claim[] = [];
  if (Array.isArray(obj.claims)) {
    for (const c of obj.claims) {
      if (!c || typeof c !== "object") continue;
      const item = c as Record<string, unknown>;
      const sentence = typeof item.sentence === "string" ? item.sentence.trim() : "";
      const ids = Array.isArray(item.fact_ids)
        ? item.fact_ids.filter((x): x is string => typeof x === "string")
        : [];
      if (sentence) claims.push({ sentence, fact_ids: ids });
    }
  }
  return { draft, claims, subject };
}

/** A place named after in/at/near/around is a factual claim. "in Manchester"
 *  must not survive a listing that says Leeds, even if the sentence cites a
 *  fact. Any place-like capitalised noun that no fact mentions is removed. */
const PLACE_CLAIM =
  /\b(?:in|at|near|around|across|serving|based in)\s+([A-Z][a-zA-Z'\u2019-]{2,})/g;

export function stripUnsupportedPlaces(
  sentences: string[],
  facts: Fact[],
): { kept: string[]; blocked: Array<{ sentence: string; reason: string }> } {
  const known = facts.map((f) => f.value.toLowerCase()).filter(Boolean);
  const kept: string[] = [];
  const blocked: Array<{ sentence: string; reason: string }> = [];

  for (const sentence of sentences) {
    let unsupported: string | null = null;
    for (const m of sentence.matchAll(PLACE_CLAIM)) {
      const place = String(m[1] ?? "").toLowerCase();
      if (!place) continue;
      if (!known.some((v) => v.includes(place))) {
        unsupported = String(m[1]);
        break;
      }
    }
    if (unsupported) {
      blocked.push({
        sentence,
        reason: `names a place no fact supports: ${unsupported}`,
      });
    } else {
      kept.push(sentence);
    }
  }
  return { kept, blocked };
}

/** Parse, then enforce. Never returns an unchecked draft. */
export function guardDraft(raw: string, facts: Fact[]): WriterOutcome {
  // No verified facts means there is nothing true to say about this business.
  // Greetings alone are not an email, so the draft is empty by rule.
  if (!facts.length) {
    return {
      content: "",
      claims: [],
      blocked: [{ sentence: "", reason: "no verified fact about this business" }],
      facts,
      empty: true,
    };
  }

  const parsed = parseWriterJson(raw);
  if (!parsed) {
    return {
      content: "",
      claims: [],
      blocked: [{ sentence: "", reason: "model did not return a JSON draft with citations" }],
      facts,
      empty: true,
    };
  }

  const first = enforceClaims(parsed.draft, parsed.claims, facts);

  const places = stripUnsupportedPlaces(first.kept, facts);
  const blocked = [...first.blocked, ...places.blocked];

  // A greeting and a sign-off are not an email. If no sentence that says
  // something survived, the draft is empty, whatever pleasantries remain.
  const substantive = places.kept.filter((s) => !isPleasantry(s));
  const content = substantive.length ? places.kept.join("\n").trim() : "";
  return {
    content,
    claims: parsed.claims,
    blocked,
    facts,
    empty: content.length === 0,
  };
}
