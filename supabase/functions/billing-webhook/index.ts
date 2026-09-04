import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_LIMITS: Record<string, number> = {
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

// Map Lemon Squeezy variant names/ids to our plan ids.
// Accepts env override: PLAN_VARIANT_MAP = "12345:starter,67890:growth,..."
function resolvePlan(variantId?: number, variantName?: string): string | null {
  const mapEnv = Deno.env.get("PLAN_VARIANT_MAP");
  if (mapEnv && variantId) {
    for (const pair of mapEnv.split(",")) {
      const [id, plan] = pair.split(":").map((s) => s.trim());
      if (String(variantId) === id && PLAN_LIMITS[plan]) return plan;
    }
  }
  const name = (variantName ?? "").toLowerCase();
  if (name.includes("agency")) return "agency";
  if (name.includes("growth")) return "growth";
  if (name.includes("starter")) return "starter";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 500);

  const rawBody = await req.text();
  const signature = req.headers.get("X-Signature") ?? "";
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(digest, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("mismatch");
  } catch {
    console.error("[billing-webhook] Invalid signature");
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: {
    meta?: { event_name?: string; custom_data?: { user_id?: string } };
    data?: {
      attributes?: {
        variant_name?: string;
        variant_id?: number;
        user_email?: string;
        status?: string;
      };
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Bad payload" }, 400);
  }

  const eventName = payload.meta?.event_name ?? "";
  if (!["order_created", "subscription_created", "subscription_updated", "subscription_plan_changed"].includes(eventName)) {
    return json({ ok: true, ignored: eventName });
  }

  const attrs = payload.data?.attributes ?? {};
  const userId = payload.meta?.custom_data?.user_id;
  if (!userId) {
    console.error("[billing-webhook] No user_id in custom_data");
    return json({ error: "Missing user_id" }, 400);
  }

  // Cancellation / expired -> downgrade to starter
  const status = attrs.status ?? "";
  if (eventName === "subscription_updated" && ["cancelled", "expired", "unpaid"].includes(status)) {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: current } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
    const downgradeTo = current?.plan === "free" ? "free" : "starter";
    await supabase.from("profiles").update({ plan: downgradeTo }).eq("id", userId);
    return json({ ok: true, downgraded: true, plan: downgradeTo });
  }

  const plan = resolvePlan(attrs.variant_id, attrs.variant_name);
  if (!plan) return json({ error: "Unknown variant" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, plan, dailyLimit: PLAN_LIMITS[plan] });
});
