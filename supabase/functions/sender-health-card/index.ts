// Sending health for the signed-in user.
// sender_health is service-role only, so the browser cannot read it directly.
// This returns only counts and the current cap: no addresses, no content.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveDailyCap, type CapProfile } from "../_shared/sender-health.ts";
import { effectivePlan } from "../_shared/effective-plan.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_DAILY: Record<string, number> = {
  free: 10,
  starter: 50,
  growth: 200,
  agency: 500,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from("profiles")
      .select("id, plan, referral_reward_plan, referral_reward_until, created_at, gmail_account_type, emails_sent_today, emails_sent_date")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);

    const plan = effectivePlan(profile);
    const planDaily = PLAN_DAILY[plan] ?? 10;
    const cap = await resolveDailyCap(
      admin,
      profile as CapProfile,
      planDaily,
      profile.gmail_account_type === "workspace" ? 2000 : 500,
    );

    const { data: health } = await admin
      .from("sender_health")
      .select("phase, current_cap, warm_cap, sends_7d, bounces_7d, unsubs_7d, replies_7d, bounce_rate_7d, complaint_rate_7d, last_measured_at")
      .eq("profile_id", userId)
      .maybeSingle();

    const today = new Date().toISOString().split("T")[0];
    const usedToday = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
    const fresh = health?.last_measured_at
      ? Date.now() - new Date(health.last_measured_at).getTime() < 36 * 3600 * 1000
      : false;

    return json({
      plan,
      planDaily,
      cap,
      usedToday,
      phase: fresh ? health?.phase ?? "ramp" : "ramp",
      measured: fresh,
      lastMeasuredAt: fresh ? health?.last_measured_at ?? null : null,
      sends7d: fresh ? health?.sends_7d ?? 0 : 0,
      bounces7d: fresh ? health?.bounces_7d ?? 0 : 0,
      unsubs7d: fresh ? health?.unsubs_7d ?? 0 : 0,
      replies7d: fresh ? health?.replies_7d ?? 0 : 0,
      bounceRate7d: fresh ? Number(health?.bounce_rate_7d ?? 0) : 0,
      unsubRate7d: fresh ? Number(health?.complaint_rate_7d ?? 0) : 0,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
