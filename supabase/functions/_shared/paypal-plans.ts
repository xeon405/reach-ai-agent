// ============================================================
// PAYPAL PLAN CATALOG — the active billing source of truth.
//
// The browser sends a PLAN ID, never an amount. We look the price
// up HERE, server-side, and charge exactly that. That is what
// stops a tampered client from paying $1 for the Agency plan.
//
// Razorpay remains in the repo as a dormant fallback
// (see razorpay-plans.ts). Keep the two catalogs in sync while
// both exist; this file is what live checkout reads.
// ============================================================

export interface PayPalPlan {
  id: "starter" | "growth" | "agency";
  name: string;
  /** Minor units (USD cents). PayPal's API wants a decimal string — use amountValue(). */
  amountCents: number;
  currency: "USD";
  emailCap: number;
  campaignCap: number | null;
}

export const PAYPAL_CURRENCY = "USD" as const;

export const PAYPAL_PLANS: Record<string, PayPalPlan> = {
  starter: { id: "starter", name: "Starter", amountCents: 3700, currency: "USD", emailCap: 50, campaignCap: 1 },
  growth: { id: "growth", name: "Growth", amountCents: 7900, currency: "USD", emailCap: 200, campaignCap: 5 },
  agency: { id: "agency", name: "Agency", amountCents: 14900, currency: "USD", emailCap: 500, campaignCap: null },
};

export function paypalPlan(planId: unknown): PayPalPlan | null {
  if (typeof planId !== "string") return null;
  return PAYPAL_PLANS[planId.trim().toLowerCase()] ?? null;
}

/** PayPal amounts are decimal strings: 3700 -> "37.00". */
export function amountValue(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

/** Parse a PayPal decimal string back to minor units: "37.00" -> 3700. */
export function centsFromValue(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
