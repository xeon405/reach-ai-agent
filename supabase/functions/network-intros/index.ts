// NETWORK-INTROS — warm B2B intros between platform users.
// Emails/phones of network members are NEVER exposed. Requests are double opt-in:
// searcher requests → target gets an in-app alert → target accepts/rejects.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_REQUEST_LIMIT = 5;
const ACTIVE_INTROS_PER_TARGET = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function masked(b: Record<string, any> | null) {
  if (!b) return null;
  return {
    business: b.name || b.company || "A network business",
    company: b.company,
    offer: b.offer || b.business_description || "",
    website_url: b.website_url,
    country: b.autopilot_country || null,
    niche: b.autopilot_niche || null,
  };
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
    const me = user.id;

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "list";

    // ── MY OWN BUSINESS CARD (for alerts/audit) ──
    const { data: myProfile } = await supabase.from("profiles")
      .select("name, company, website_url, offer").eq("id", me).single();
    const myBusiness = myProfile?.name || myProfile?.company || "Someone";

    if (action === "request") {
      const targetId: string | null = typeof body.target_user_id === "string" ? body.target_user_id : null;
      if (!targetId) throw new Error("Missing target_user_id");
      if (targetId === me) throw new Error("You can't request an intro to yourself");

      const msg = String(body.message ?? "").trim().slice(0, 500);

      const { data: target } = await supabase.from("profiles")
        .select("id, name, company, website_url, offer, network_mode").eq("id", targetId).single();
      if (!target) throw new Error("Target not found");
      if (!target.network_mode) throw new Error("That business isn't accepting intros right now");

      const { data: existing } = await supabase.from("intro_requests").select("id")
        .eq("requester_user_id", me).eq("target_user_id", targetId).eq("status", "pending").maybeSingle();
      if (existing) throw new Error("You already have a pending intro with this business");

      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count: today } = await supabase.from("intro_requests")
        .select("id", { count: "exact", head: true })
        .eq("requester_user_id", me).gte("created_at", dayStart.toISOString());
      if ((today ?? 0) >= DAILY_REQUEST_LIMIT) throw new Error(`Daily intro request limit reached (${DAILY_REQUEST_LIMIT})`);

      const { count: open } = await supabase.from("intro_requests")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", targetId).eq("status", "pending");
      if ((open ?? 0) >= ACTIVE_INTROS_PER_TARGET) throw new Error("That business has too many open intros right now");

      const { data: created, error: insertErr } = await supabase.from("intro_requests").insert({
        requester_user_id: me, target_user_id: targetId, message: msg || null,
      }).select("id").single();
      if (insertErr || !created) throw new Error(insertErr?.message ?? "Failed to create intro");

      await supabase.from("owner_alerts").insert({
        user_id: targetId, kind: "network_intro",
        title: `🔔 ${myBusiness} wants to reach you`,
        body: `${myBusiness} found you through the outreach network.\n${myProfile?.website_url ? `See them: ${myProfile.website_url}\n` : ""}${msg ? `Message: "${msg}"` : "They didn't leave a message."}\nAccept or decline in your Alerts.`,
        priority: "high",
      });
      await insertAudit(supabase, { user_id: me, lead_id: null, campaign_id: null, event: "intro.requested", payload: { target_user_id: targetId } });

      return json({ ok: true, intro_id: created.id, message: `Intro request sent to ${target.name || target.company || "them"}` });
    }

    if (action === "respond") {
      const rid: string | null = typeof body.request_id === "string" ? body.request_id : null;
      const accept: boolean = !!body.accept;
      if (!rid) throw new Error("Missing request_id");

      const { data: r, error: rErr } = await supabase.from("intro_requests")
        .select("id, requester_user_id, target_user_id, status, message, created_at").eq("id", rid).single();
      if (rErr || !r) throw new Error("Intro not found");
      if (r.target_user_id !== me) throw new Error("This intro isn't yours to respond to");
      if (r.status !== "pending") throw new Error("This intro was already handled");

      const { error: upErr } = await supabase.from("intro_requests")
        .update({ status: accept ? "accepted" : "rejected", resolved_at: new Date().toISOString() }).eq("id", rid);
      if (upErr) throw new Error(upErr.message);

      const requesterProfile = masked(myProfile);
      await supabase.from("owner_alerts").insert({
        user_id: r.requester_user_id, kind: accept ? "network_intro_accepted" : "network_intro_rejected",
        title: accept ? `✅ ${requesterProfile?.business} accepted your intro` : `${requesterProfile?.business} declined your intro`,
        body: accept
          ? `${requesterProfile?.business} welcomed your message. They're open to hearing from you now — make your first email count.\n${requesterProfile?.website_url ? `Their site: ${requesterProfile.website_url}\n` : ""}Find their business card in your Alerts / Network panel.`
          : `${requesterProfile?.business} isn't looking right now. No problem — keep them in mind for later.`,
        priority: accept ? "high" : "normal",
      });
      await insertAudit(supabase, { user_id: me, lead_id: null, campaign_id: null, event: accept ? "intro.accepted" : "intro.rejected", payload: { requester_user_id: r.requester_user_id } });

      return json({ ok: true, message: accept ? "Intro accepted — they've been notified" : "Intro declined" });
    }

    // ── LIST: my outgoing + incoming ──
    const { data: outgoing } = await supabase.from("intro_requests")
      .select("id, target_user_id, message, status, created_at, resolved_at")
      .eq("requester_user_id", me).order("created_at", { ascending: false }).limit(50);
    const { data: incoming } = await supabase.from("intro_requests")
      .select("id, requester_user_id, message, status, created_at, resolved_at")
      .eq("target_user_id", me).order("created_at", { ascending: false }).limit(50);

    const ids = [...new Set([...(outgoing ?? []).map((o) => o.target_user_id), ...(incoming ?? []).map((i) => i.requester_user_id)])];
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, name, company, offer, business_description, website_url, autopilot_country, autopilot_niche").in("id", ids)
      : { data: [] };
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));

    return json({
      ok: true,
      outgoing: (outgoing ?? []).map((o) => ({ id: o.id, other: masked(byId.get(o.target_user_id) ?? null), message: o.message, status: o.status, created_at: o.created_at, resolved_at: o.resolved_at })),
      incoming: (incoming ?? []).map((i) => ({ id: i.id, other: masked(byId.get(i.requester_user_id) ?? null), message: i.message, status: i.status, created_at: i.created_at, resolved_at: i.resolved_at })),
    });
  } catch (err) {
    const status = typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 400;
    return json({ error: (err as Error)?.message ?? "Something went wrong" }, status);
  }
});