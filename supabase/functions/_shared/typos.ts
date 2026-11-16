// ============================================================================
// TYPO CLEANUP — product words only, exact spellings only.
//
// The agent already matches known commands locally. What it could not do was
// recognise the same command when it was misspelled, so "pase my campain"
// cost a model call while "pause my campaign" was free.
//
// This is NOT fuzzy matching. There is no edit distance, no similarity score,
// no guessing. A word changes only when it is an exact key in the table below,
// and only when:
//   * it is all lowercase (so a capitalised name is never touched),
//   * it is a standalone token (so an email, URL or number is never touched),
//   * the replacement is the same part of speech in the same product context.
//
// A few risky words are handled as whole phrases instead of tokens. "pase" is a
// surname and could be a place, so it is corrected only in "pase my campaign".
// "leeds" is a real city and is deliberately NOT in the table at all: turning
// "find dentists in leeds" into "find dentists in leads" would be worse than
// paying for one model call.
//
// Pure TS: no imports, no Deno globals, no I/O. The Node suite runs this exact
// file, so the tested code is the shipped code.
// ============================================================================

/**
 * Whole phrases that are safe to correct even at the start of a sentence.
 * Kept before the token pass because the token pass refuses capitalised words.
 */
const PHRASES: Array<[RegExp, string]> = [
  [/\bpase (my|our|the) (campaign|campaigns)\b/gi, "pause $1 $2"],
  [/\bpasue (my|our|the) (campaign|campaigns)\b/gi, "pause $1 $2"],
  [/\bpaus (my|our|the) (campaign|campaigns)\b/gi, "pause $1 $2"],
  [/\bpauze (my|our|the) (campaign|campaigns)\b/gi, "pause $1 $2"],
];

/**
 * Single-word corrections. Every key is a misspelling, never a real word or a
 * name. Every value is the product word it can only mean in this app.
 */
const WORDS: Record<string, string> = {
  // campaign
  campain: "campaign",
  campains: "campaigns",
  campaing: "campaign",
  campaings: "campaigns",
  campagin: "campaign",
  campagins: "campaigns",
  camapign: "campaign",
  camapigns: "campaigns",
  // gmail
  gmal: "gmail",
  gmial: "gmail",
  gmaill: "gmail",
  // follow-up
  folow: "follow",
  folowup: "followup",
  folowups: "followups",
  // connect / disconnect
  conenct: "connect",
  conect: "connect",
  connct: "connect",
  disconect: "disconnect",
  disconenct: "disconnect",
  // replies
  replis: "replies",
  repls: "replies",
  replys: "replies",
  // subject
  subjet: "subject",
  subjets: "subjects",
  // website
  websit: "website",
  webiste: "website",
  wedsite: "website",
  // autopilot
  autopiolt: "autopilot",
  autopliot: "autopilot",
  // verification
  verifed: "verified",
  verfied: "verified",
  // delete
  delte: "delete",
  delet: "delete",
  // statistics / performance / deliverability
  statisics: "statistics",
  statstics: "statistics",
  perfomance: "performance",
  performace: "performance",
  delivrability: "deliverability",
  deliverabilty: "deliverability",
  // unsubscribe
  unsubcribed: "unsubscribed",
  unsubscirbed: "unsubscribed",
  unsubcribe: "unsubscribe",
  unsuscribe: "unsubscribe",
  // billing words (routing only; the answer still comes from the AI)
  refnd: "refund",
  refudn: "refund",
  invoce: "invoice",
  invioce: "invoice",
  acount: "account",
  accout: "account",
  pasword: "password",
  passwrod: "password",
  // misc product words
  emials: "emails",
  emalis: "emails",
  calendy: "calendly",
  linkdin: "linkedin",
};

/**
 * Correct the product words in a message without touching anything that could
 * be a name, an address, a URL or a number.
 *
 * Tokens are split on whitespace. A token is corrected only when its core is
 * one uninterrupted lowercase letter run; `gmal@gmail.com`, `Bob`, `Leeds`,
 * `campaign-2` and `$37` all fail that test and are returned untouched.
 */
export function fixTypos(text: string): string {
  const tokenFixed = String(text ?? "")
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      const m = part.match(/^([^\p{L}]*)(\p{L}+)([^\p{L}]*)$/u);
      if (!m) return part;
      const [, before, word, after] = m;
      // A capitalised word may be a person, a city or a brand. Never rewrite it.
      if (word !== word.toLowerCase()) return part;
      const fixed = WORDS[word];
      return fixed ? before + fixed + after : part;
    })
    .join("");
  // Phrase pass runs last so the token pass has already fixed the noun
  // ("campain" -> "campaign") that the phrase pattern depends on.
  return PHRASES.reduce((out, [re, replacement]) => out.replace(re, replacement), tokenFixed);
}
