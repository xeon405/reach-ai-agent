// ============================================================
// REVIEW MODE — who has to read an email before it is sent.
//
// Pure and deterministic so the rule can be tested without a mailbox, a model
// or a network. The worker still re-checks the lead, the campaign and the daily
// cap before anything leaves; this only decides whether a finished draft is held.
// ============================================================

export type ReviewMode = "first_20" | "always" | "off";

/** The unknown-sender period: a new account's first 20 emails are held. The
 *  count is lifetime sends, so approving them is what ends the period. */
export const REVIEW_FIRST_SENDS = 20;

/** Unknown values fail safe to review. A typo in the database must never turn
 *  review off for an account that has not earned it. */
export function shouldHoldForReview(mode: unknown, lifetimeSends: number): boolean {
  const m: ReviewMode = mode === "always" || mode === "off" ? mode : "first_20";
  if (m === "off") return false;
  if (m === "always") return true;
  const sent = Number.isFinite(lifetimeSends) ? Number(lifetimeSends) : 0;
  return sent < REVIEW_FIRST_SENDS;
}
