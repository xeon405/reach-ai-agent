// ============================================================
// PAGE FACTS — turn one public web page into a few provable facts.
//
// Used by the signup-free demo. Same contract as every other fact: value,
// exact quote, source URL, checked-at. A sentence that a visitor could not
// read on the page never becomes a fact.
//
// Pure functions only: the network fetch lives in the demo function, so the
// selection rules are testable offline.
// ============================================================

import {
  decodeEntities,
  extractVisibleText,
  makeFact,
  normalizeForMatch,
  type Fact,
} from "./fact-layer.ts";

/** Boilerplate that says nothing about the business. */
const BOILERPLATE =
  /\b(cookie|cookies|privacy|terms|all rights reserved|copyright|subscribe|newsletter|sign in|log in|javascript|enable javascript|your browser|accept all|manage preferences|email us|call us|contact us|book now)\b/i;

/** A fact must never carry an email address: the demo never shows one. */
const EMAILISH = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONEISH = /(?:\+?\d[\d\s().-]{7,}\d)/;

export function looksLikeEmail(text: string): boolean {
  return EMAILISH.test(String(text ?? ""));
}

/** Private, loopback, link-local and metadata addresses are never fetched. */
export function ipIsPrivate(raw: string): boolean {
  const ip = String(raw ?? "").trim().toLowerCase();
  if (!ip) return true;
  if (ip.includes(":")) {
    if (ip === "::1" || ip === "::") return true;
    if (ip.startsWith("::ffff:")) return ipIsPrivate(ip.slice(7));
    if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // fe80::/10
    if (ip.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224
  );
}

export function hostIsPrivate(hostname: string): boolean {
  const h = String(hostname ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home") || h.endsWith(".lan")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return ipIsPrivate(h);
  if (h.includes(":")) return ipIsPrivate(h);
  return false;
}

/** Only a normal public web address is accepted. */
export function normalizeDemoUrl(input: string): URL | null {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 500) return null;
  // A URL scheme must be http or https. Without this, "file:///etc/passwd"
  // would be treated as a hostname and prefixed with https.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (hostIsPrivate(url.hostname)) return null;
  url.hash = "";
  return url;
}

/** The first visible heading. A hidden heading is not shown to anyone, so it
 *  cannot name the business. */
export function firstVisibleHeading(html: string): string {
  const visible = normalizeForMatch(extractVisibleText(html));
  const re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  for (const m of String(html ?? "").matchAll(re)) {
    const text = decodeEntities(String(m[1] ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length > 120) continue;
    if (visible.includes(normalizeForMatch(text))) return text;
  }
  return "";
}

function sentencesOf(visible: string): string[] {
  return String(visible ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function usableSentence(sentence: string): boolean {
  if (sentence.length < 40 || sentence.length > 220) return false;
  if (sentence.split(" ").length < 7) return false;
  if (BOILERPLATE.test(sentence)) return false;
  if (EMAILISH.test(sentence) || PHONEISH.test(sentence)) return false;
  const letters = sentence.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upper = sentence.replace(/[^A-Z]/g, "");
  if (upper.length > letters.length * 0.6) return false;
  return true;
}

/** Up to `limit` page facts, each one a sentence a visitor can read. */
export function pickPageFacts(input: {
  html: string;
  sourceUrl: string;
  checkedAt: string;
  limit?: number;
}): { businessName: string; facts: Fact[] } {
  const visible = extractVisibleText(input.html);
  const limit = input.limit ?? 5;
  const facts: Fact[] = [];

  const name = firstVisibleHeading(input.html);
  if (name) {
    const supporting = sentencesOf(visible).find(
      (s) => s.length >= 12 && normalizeForMatch(s).includes(normalizeForMatch(name)),
    );
    const fact = supporting
      ? makeFact({
        id: "p0",
        kind: "name",
        value: name,
        quote: supporting,
        sourceUrl: input.sourceUrl,
        checkedAt: input.checkedAt,
        source: "page",
        visibleText: visible,
      })
      : null;
    if (fact) facts.push(fact);
  }

  const seen = new Set<string>();
  for (const sentence of sentencesOf(visible)) {
    if (facts.length >= limit + (name ? 1 : 0)) break;
    if (!usableSentence(sentence)) continue;
    const key = normalizeForMatch(sentence);
    if (seen.has(key)) continue;
    seen.add(key);
    const fact = makeFact({
      id: `p${facts.length}`,
      kind: "page_quote",
      value: sentence,
      quote: sentence,
      sourceUrl: input.sourceUrl,
      checkedAt: input.checkedAt,
      source: "page",
      visibleText: visible,
    });
    if (fact) facts.push(fact);
  }

  return { businessName: name, facts };
}
