// Website email enrichment — crawls public business websites to find displayed email addresses
// Only collects publicly displayed emails from contact/about/team/footer pages.
// Deno runtime. Used by google-maps.ts and osm.ts.

export interface EnrichedEmail {
  email: string;
  source_url: string;
  source_type: "text" | "mailto" | "metadata";
  confidence: number;
}

export interface EnrichmentResult {
  emails: EnrichedEmail[];
  pages_crawled: number;
  pages_failed: number;
  domain: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "10minutemail.com", "trashmail.com", "sharklasers.com",
  "guerrillamailblock.com", "grr.la", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "tempail.com", "tempr.email", "temp-mail.org",
  "getnada.com", "mohmal.com", "burnermail.io",
]);

const IGNORE_EXT = /\.(png|jpg|jpeg|gif|svg|webp|pdf|doc|xls|zip|mp[34]|css|js|ico|woff|ttf|eot)$/i;

const CONTACT_KEYWORDS = /contact|about|team|staff|people|impressum|support|help|info|company|location|reach/i;

const METADATA_RE = /content=["']([^"']*?@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}?)["']/gi;

const MAX_PAGES = 5;
const PER_PAGE_TIMEOUT_MS = 6_000;
const TOTAL_TIMEOUT_MS = 25_000;

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "");
}

function isValidCandidate(email: string): boolean {
  if (email.length > 254) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length > 64 || domain.length > 253) return false;
  if (domain.length < 4) return false;
  if (DISPOSABLE.has(domain)) return false;
  if (IGNORE_EXT.test(email)) return false;
  if (/^(png|jpg|gif|image|file|test|xxx)/i.test(local)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|pdf|doc)/i.test(local)) return false;
  // Reject obvious placeholders
  if (/^(user|name|email|your|my|the|our|someone|example|sample|john|jane|tom|bob|info|admin|test|fake|spam|mail)$/i.test(local)) return false;
  if (/^(user|name|email|your|my|the|our)@/i.test(email)) return false;
  return true;
}

function extractEmailsFromHtml(html: string, pageUrl: string): EnrichedEmail[] {
  const results: EnrichedEmail[] = [];
  const seen = new Set<string>();

  // 1. mailto: links — highest confidence (business intentionally published this)
  const mailtoRe = /href=["']mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    const email = normalizeEmail(m[1]);
    if (isValidCandidate(email) && !seen.has(email)) {
      seen.add(email);
      results.push({ email, source_url: pageUrl, source_type: "mailto", confidence: 95 });
    }
  }

  // 2. Visible text emails
  const textEmails = html.match(EMAIL_RE) ?? [];
  for (const raw of textEmails) {
    const email = normalizeEmail(raw);
    if (isValidCandidate(email) && !seen.has(email)) {
      seen.add(email);
      results.push({ email, source_url: pageUrl, source_type: "text", confidence: 80 });
    }
  }

  // 3. HTML metadata (og:email, etc.) — lower confidence
  let meta: RegExpExecArray | null;
  while ((meta = METADATA_RE.exec(html)) !== null) {
    const email = normalizeEmail(meta[1]);
    if (isValidCandidate(email) && !seen.has(email)) {
      seen.add(email);
      results.push({ email, source_url: pageUrl, source_type: "metadata", confidence: 60 });
    }
  }

  return results;
}

function discoverLinks(html: string, baseOrigin: string): string[] {
  const linkRe = /href=["']([^"']+)["']/gi;
  const raw: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    raw.push(m[1]);
  }

  const scored: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();

  for (const href of raw) {
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (IGNORE_EXT.test(href)) continue;

    let absolute: string;
    try {
      absolute = new URL(href, baseOrigin).href;
    } catch {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(absolute);
    } catch {
      continue;
    }

    // Same domain only
    if (parsed.origin !== baseOrigin) continue;

    // Strip hash and trailing slash for dedup
    const canonical = (parsed.origin + parsed.pathname).replace(/\/+$/, "").toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    // Skip non-HTML resources by extension
    if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|pdf|doc|xls|zip|mp[34]|ico|woff|ttf|eot)(\?|$)/i.test(absolute)) continue;

    // Score by relevance to contact/about pages
    const pathLower = parsed.pathname.toLowerCase();
    let score = 0;
    if (/contact/i.test(pathLower)) score += 100;
    else if (/about/i.test(pathLower)) score += 80;
    else if (/team|staff|people/i.test(pathLower)) score += 70;
    else if (/support|help/i.test(pathLower)) score += 50;
    else if (/impressum|legal|privacy/i.test(pathLower)) score += 40;
    else if (/faq|question/i.test(pathLower)) score += 30;
    else if (/service|product/i.test(pathLower)) score += 20;
    else score += 5;

    // Boost if path contains keyword patterns
    if (CONTACT_KEYWORDS.test(pathLower)) score += 25;

    scored.push({ url: absolute, score });
  }

  // Sort by score descending — most relevant pages first
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.url);
}

async function fetchPage(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "User-Agent": "OutreachAI-EmailEnrichment/1.0 (https://outreach-ochre-sigma.vercel.app; +https://outreach-ochre-sigma.vercel.app/privacy)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function enrichWebsiteEmails(websiteUrl: string): Promise<EnrichmentResult> {
  let baseUrl: URL;
  try {
    const u = websiteUrl.startsWith("http") ? websiteUrl : "https://" + websiteUrl;
    baseUrl = new URL(u);
  } catch {
    return { emails: [], pages_crawled: 0, pages_failed: 0, domain: "" };
  }

  const domain = baseUrl.hostname.replace(/^www\./, "");
  const baseOrigin = baseUrl.origin;
  const allEmails: EnrichedEmail[] = [];
  const seenEmails = new Set<string>();
  const seenPages = new Set<string>();
  let pagesCrawled = 0;
  let pagesFailed = 0;

  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    // Phase 1: Fetch homepage
    const homeUrl = baseOrigin + baseUrl.pathname.replace(/\/+$/, "") + "/";
    const homeHtml = await fetchPage(homeUrl, controller.signal);
    pagesCrawled++;

    if (!homeHtml) {
      pagesFailed++;
      return { emails: [], pages_crawled: pagesCrawled, pages_failed: pagesFailed, domain };
    }

    // Extract emails from homepage
    const homeEmails = extractEmailsFromHtml(homeHtml, homeUrl);
    for (const e of homeEmails) {
      if (!seenEmails.has(e.email)) {
        seenEmails.add(e.email);
        allEmails.push(e);
      }
    }
    seenPages.add(homeUrl);

    // Phase 2: Discover and crawl internal pages (prioritized by relevance)
    const links = discoverLinks(homeHtml, baseOrigin);
    const pagesToCrawl = links.slice(0, MAX_PAGES - 1);

    // Also fetch robots.txt to check for Disallow rules
    let disallowedPaths: string[] = [];
    try {
      const robotsHtml = await fetchPage(baseOrigin + "/robots.txt", controller.signal);
      if (robotsHtml) {
        const disallowRe = /Disallow:\s*(.+)/gi;
        let dm: RegExpExecArray | null;
        while ((dm = disallowRe.exec(robotsHtml)) !== null) {
          const path = dm[1].trim();
          if (path && path !== "/") disallowedPaths.push(path);
        }
      }
    } catch {
      // robots.txt fetch failure is non-fatal
    }

    for (const pageUrl of pagesToCrawl) {
      if (seenPages.size >= MAX_PAGES) break;
      if (controller.signal.aborted) break;

      // Check robots.txt disallow
      let parsedPage: URL;
      try {
        parsedPage = new URL(pageUrl);
      } catch {
        continue;
      }
      if (disallowedPaths.some((dp) => parsedPage.pathname.startsWith(dp))) continue;

      const canonical = (parsedPage.origin + parsedPage.pathname).replace(/\/+$/, "").toLowerCase();
      if (seenPages.has(canonical)) continue;
      seenPages.add(canonical);

      const html = await fetchPage(pageUrl, controller.signal);
      pagesCrawled++;
      if (!html) {
        pagesFailed++;
        continue;
      }

      const pageEmails = extractEmailsFromHtml(html, pageUrl);
      for (const e of pageEmails) {
        if (!seenEmails.has(e.email)) {
          seenEmails.add(e.email);
          allEmails.push(e);
        }
      }

      // If we found enough emails, stop crawling
      if (allEmails.length >= 5) break;
    }
  } finally {
    clearTimeout(totalTimer);
  }

  return {
    emails: allEmails,
    pages_crawled: pagesCrawled,
    pages_failed: pagesFailed,
    domain,
  };
}
