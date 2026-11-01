// ============================================================================
// Reply shape — the decision variable that makes reply-style learning possible.
//
// Before this file the reply prompt was a single fixed instruction string, so
// there was nothing to attribute an outcome to: a meeting could not be traced
// back to a "shape" because no shape had ever been chosen or recorded.
// Learning without a recorded decision is guessing with extra steps.
//
// The three shapes below are deliberately close to each other. They are all
// legitimate 3-4 sentence replies that answer the question and never invent a
// fact — they differ in ORDER and EMPHASIS, not in quality. That is what makes
// a natural experiment safe: no prospect receives a worse reply, but the data
// can still say which ordering this audience books from.
//
// Selection is deterministic per lead (see pickReplyStyle), so a conversation
// keeps one shape from first reply to last. Switching shape mid-thread would
// read as a different person.
// ============================================================================

export type ReplyStyle = { key: string; label: string; directive: string };

export const REPLY_STYLES: ReplyStyle[] = [
  {
    key: "answer_first",
    label: "answer, then one question",
    directive:
      "REPLY SHAPE — answer what they actually asked in your FIRST sentence, in plain words. Then add the one supporting detail that matters to them. Close with at most one genuine question.",
  },
  {
    key: "detail_first",
    label: "concrete detail, then the answer",
    directive:
      "REPLY SHAPE — open with one concrete, specific detail (from the company knowledge base or their own message) that speaks to their situation. Then answer their question directly. Close with at most one question, or none.",
  },
  {
    key: "question_first",
    label: "short question, then the answer",
    directive:
      "REPLY SHAPE — open with one short, genuine question about their situation (never about booking). Answer what they asked immediately after. Keep the whole reply under five sentences.",
  },
];

const BY_KEY = new Map(REPLY_STYLES.map((s) => [s.key, s]));

/** FNV-1a, identical to ai-lib's hash so behaviour is predictable to anyone
 *  reading both files. Not cryptographic — it only needs to spread evenly. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable shape for a conversation. Seeded on the lead, not the message, so a
 *  multi-turn thread never changes voice halfway through. */
export function pickReplyStyle(seed: string): ReplyStyle {
  return REPLY_STYLES[hash(String(seed ?? "")) % REPLY_STYLES.length];
}

export function replyStyleByKey(key: string | null | undefined): ReplyStyle | null {
  if (!key) return null;
  return BY_KEY.get(String(key).trim()) ?? null;
}
