// REFERRAL-CLAIM — credit a signup to the referrer whose link was used.
// The referrer earns 7 days of free starter access (stacks, never downgrades).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REWARD_DAYS = 7;
const REWARD_PLAN = "starter";
const REWARD_MS = REWARD_DAYS * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const env = Deno.env.toObject();
    const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw Object.assign(new Error("Not authenticated"), { status: 401 });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw Object.assign(new Error("Invalid session"), { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ref = typeof body.ref === "string" ? body.ref.trim() : "";
    if (!ref) return json({ ok: true, message: "No referral" });

    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, referral_code, referral_reward_until")
      .eq("referral_code", ref)
      .neq("id", user.id)
      .maybeSingle();
    if (!referrer) return json({ ok: true, message: "No matching referrer" });

    const referredEmail = (user.email ?? "").toLowerCase();
    const isSelf = referrer.id === user.id;

    // Idempotent — a friend can only earn one reward per referrer.
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referrer_id", referrer.id)
      .eq("referred_email", referredEmail)
      .maybeSingle();
    if (!isSelf && existing) {
      return json({ ok: true, message: "Already credited" });
    }

    if (!isSelf) {
      await supabase.from("referrals").insert({
        referrer_id: referrer.id,
        referred_email: referredEmail,
        status: "joined",
        reward_days: REWARD_DAYS,
      });
    }

    // Grant / extend the referrer's free upgrade.
    const nowMs = Date.now();
    const currentUntil = referrer.referral_reward_until ? new Date(referrer.referral_reward_until).getTime() : 0;
    const start = currentUntil > nowMs ? currentUntil : nowMs;
    const rewardUntil = new Date(start + REWARD_MS).toISOString();
    await supabase
      .from("profiles")
      .update({ referral_reward_plan: REWARD_PLAN, referral_reward_until: rewardUntil })
      .eq("id", referrer.id);

    if (!isSelf) {
      // Record who this referrer brought in (on the new account too).
      await supabase.from("profiles").update({ referred_by: ref }).eq("id", user.id);

      const niceUntil = new Date(rewardUntil).toISOString().slice(0, 10);
      await supabase.from("owner_alerts").insert({
        user_id: referrer.id, kind: "referral_reward",
        title: `🎁 +${REWARD_DAYS} free days — a friend joined with your link`,
        body: `${user.email} signed up through your invite. You're on starter free until ${niceUntil}. Invite more friends to keep stacking.`,
        priority: "high",
      });
      await insertAudit(supabase, {
        user_id: referrer.id, lead_id: null, campaign_id: null, event: "referral.rewarded",
        payload: { referred_email: referredEmail, reward_days: REWARD_DAYS, reward_until: rewardUntil },
      });

      return json({ ok: true, plan: REWARD_PLAN, reward_until: rewardUntil, message: `You earned +${REWARD_DAYS} free days — thank yourself later.` });
    }

    return json({ ok: true, message: "Referral ignored" });
  } catch (err) {
    const status = typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 400;
    return json({ error: (err as Error)?.message ?? "Something went wrong" }, status);
  }
});