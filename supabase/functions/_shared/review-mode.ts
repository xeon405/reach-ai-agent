// ============================================================
// REVIEW MODE — who has to read an email before it is sent.
//
// Pure and deterministic so the rule can be tested without a mailbox, a model
// or a network. The worker still re-checks the lead, the campaign and the daily
// cap before anything leaves; this only decides whether a finished draft is held.
// ============================================================

export type ReviewMode = "first_5" | "always" | "off";

/** The unknown-sender period: a new account's first 5 emails are held. Five is
 *  enough to catch a bad prompt in the first session without turning the first
 *  day into paperwork. The count is lifetime sends, so approving them ends it. */
export const REVIEW_FIRST_SENDS = 5;

/** Unknown values fail safe to review. A typo in the database must never turn
 *  review off for an account that has not earned it. "first_20" is accepted as
 *  a legacy value so a stale client or an old row cannot bypass the hold. */
export function shouldHoldForReview(mode: unknown, lifetimeSends: number): boolean {
  const m: ReviewMode = mode === "always" || mode === "off" ? mode : "first_5";
  if (m === "off") return false;
  if (m === "always") return true;
  const sent = Number.isFinite(lifetimeSends) ? Number(lifetimeSends) : 0;
  return sent < REVIEW_FIRST_SENDS;
}

/**
 * The worker's full hold rule. A draft the owner already approved is never held
 * again — it already carries the exact text they read, and re-holding it would
 * make approval do nothing during the first five sends. An "approved" row with
 * no stored text is still held: there is nothing the owner could have read.
 */
export function shouldHoldJob(
  mode: unknown,
  lifetimeSends: number,
  reviewState: string | null | undefined,
  hasStoredDraft: boolean,
): boolean {
  if (reviewState === "approved" && hasStoredDraft) return false;
  return shouldHoldForReview(mode, lifetimeSends);
}
