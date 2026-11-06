// ============================================================
// SUPPORT BOUNDARY — the capability line the Guide may never cross.
//
// Pure TS: no imports, no Deno globals, no network. That is deliberate, so the
// Node harness executes the exact code that ships instead of a copy of it.
// ============================================================

/* ---------------------------------------------------------------------------
 * PERSONAL CONTACT DATA — the capability boundary.
 *
 * A tutor asked: "can I find emails of parents from your platform?" The router
 * saw the word "emails" and returned a SENDING tutorial. The answer never said
 * what the product cannot do, so a visitor could reasonably conclude we sell
 * parent lists we do not have.
 *
 * Why this is a hard boundary and not a prompt suggestion:
 *   1. It is a factual claim about our data. Saved businesses are public
 *      BUSINESS listings; there are no consumer records in the product.
 *   2. It is a legal claim. Cold-emailing private individuals without consent
 *      is restricted in the EU/UK (GDPR + ePrivacy), Canada (CASL) and others.
 *   3. It is a trust claim. Saying "no" early is what makes the rest credible.
 *
 * The detector is deliberately narrow: a private-person noun, a request verb,
 * contact data, and no business noun. Anything ambiguous goes to the model
 * with an explicit directive instead of a canned answer.
 * ------------------------------------------------------------------------- */

const PRIVATE_PERSON_RE =
  /\b(parents?|parental|mums?|moms?|mothers?|dads?|fathers?|students?|pupils?|residents?|homeowners?|tenants?|patients?|individuals?|citizens?|consumers?|people|persons?|families|familys?|kids?|children)\b/i;
const CONTACT_DATA_RE =
  /\b(e-?mails?|contacts?|phone\s+numbers?|mobile\s+numbers?|whats?app\s+numbers?|lists?|database|data)\b/i;
const REQUEST_RE =
  /\b(find|finds|finding|get|gets|getting|give|gives|provide|provides|buy|purchase|have|has|need|needs|want|wants|source|source\s+me|scrape|extract|collect|obtain|download|send|sell|share|email|e-mail|contact|reach|message|target|where\s+can\s+i\s+(get|find)|do\s+you\s+(have|sell|provide)|can\s+i\s+(get|find|buy|email|contact|reach))\b/i;
const BUSINESS_NOUN_RE =
  /\b(business(es)?|compan(y|ies)|shops?|stores?|clinics?|salons?|restaurants?|hotels?|agenc(y|ies)|schools?|academ(y|ies)|tuition\s+cent(er|re)s?|coaching\s+cent(er|re)s?|institutes?|firms?|gyms?|dentists?|lawyers?|real\s+estate|suppliers?|vendors?|startups?)\b/i;

/** True only when the message asks us to supply contact data for PRIVATE
 *  people. "Find tuition centres in Dubai" is a business ask and stays false. */
export function isPersonalContactRequest(text: string): boolean {
  const t = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (!PRIVATE_PERSON_RE.test(t)) return false;
  if (!CONTACT_DATA_RE.test(t)) return false;
  if (!REQUEST_RE.test(t)) return false;
  if (BUSINESS_NOUN_RE.test(t)) return false;
  return true;
}

/** The answer we stand behind. Deterministic, so no model can soften it into a
 *  maybe, and no code path can promise data we do not have. */
export function personalContactAnswer(opts: { signedIn?: boolean } = {}): string {
  const importLine = opts.signedIn
    ? "**If you already have a parent list you collected yourself with consent** (sign-up form, WhatsApp group, enquiry sheet), you can import it: Leads → Import CSV, or paste up to 500 contacts. OutshipAi will send to them and handle unsubscribes automatically."
    : "**If you already have a parent list you collected yourself with consent** (sign-up form, WhatsApp group, enquiry sheet), you can import it after signing up: Leads → Import CSV, or paste up to 500 contacts.";

  return [
    "**Short answer: no — not parents' emails.**",
    "",
    "OutshipAi finds **business** contact addresses, and only business ones. It searches public business listings (Google Maps and OpenStreetMap) and reads addresses a business publishes on its own website. Parents are private people, so there is no parent email list in the platform for me to give you — we do not buy, scrape, or sell personal addresses.",
    "",
    "That is also the law in most markets, not just our policy: in the EU/UK, Canada and many other places you need prior consent before cold-emailing an individual. A scraped list would get you reported and damage your sending domain, which is the fastest way to stop reaching anyone at all.",
    "",
    "**What actually works for tuition:**",
    "",
    "1. **Email the businesses around the students.** Lead Finder searches Google Maps business listings, so \"tuition centre\", \"coaching institute\" or \"school\" in your city returns real businesses with public contact addresses — one partnership or referral deal can reach many students at once.",
    "2. " + importLine,
    "3. **Reach parents through opt-in channels:** your own landing page or form, WhatsApp or Telegram groups, school newsletters, and local Facebook groups. Those convert far better than cold email anyway.",
    "",
    "Want me to show you the exact Lead Finder search for tuition centres in your city?",
  ].join("\n");
}
