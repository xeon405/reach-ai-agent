// ============================================================
// RAZORPAY PLAN CATALOG — single source of truth.
//
// The amount is decided HERE, server-side, from the plan id the
// client sends. The browser never gets to state a price: it asks
// for a plan, we look up the amount. That is what stops a tampered
// client from paying ₹1 for the Agency plan.
// ============================================================

export interface RazorpayPlan {
  id: "starter" | "growth" | "agency";
  name: string;
  /** Minor units (cents) — Razorpay expects paise/cents as an integer. */
  amountCents: number;
  currency: "USD" | "INR";
  emailCap: number;
  campaignCap: number | null;
}

export const RAZORPAY_CURRENCY = "USD" as const;

export const RAZORPAY_PLANS: Record<string, RazorpayPlan> = {
  starter: { id: "starter", name: "Starter", amountCents: 3700, currency: "USD", emailCap: 50, campaignCap: 1 },
  growth: { id: "growth", name: "Growth", amountCents: 7900, currency: "USD", emailCap: 200, campaignCap: 5 },
  agency: { id: "agency", name: "Agency", amountCents: 14900, currency: "USD", emailCap: 500, campaignCap: null },
};

export function razorpayPlan(planId: unknown): RazorpayPlan | null {
  if (typeof planId !== "string") return null;
  return RAZORPAY_PLANS[planId.trim().toLowerCase()] ?? null;
}
