// Effective plan resolution. Referral rewards grant a temporary free upgrade
// ('starter') that stacks ABOVE the subscription plan and never downgrades it.
const ORDER = ["free", "starter", "growth", "agency"];

export function effectivePlan(p: {
  plan?: string | null;
  referral_reward_plan?: string | null;
  referral_reward_until?: string | null;
}): string {
  let base = p.plan ?? "starter";
  if (ORDER.indexOf(base) === -1) base = "starter";

  const rp = p.referral_reward_plan ?? null;
  if (rp && ORDER.indexOf(rp) > -1) {
    const until = p.referral_reward_until ? new Date(p.referral_reward_until).getTime() : 0;
    if (until > Date.now() && ORDER.indexOf(rp) > ORDER.indexOf(base)) return rp;
  }
  return base;
}