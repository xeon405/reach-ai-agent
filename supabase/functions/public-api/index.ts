// PUBLIC API — task 13.
//
// Everything here is scoped to the API key's owner. A key can read the
// account's own campaigns, numbers, replies and email log, and can pause or
// resume its own campaign. It cannot read another account, send an email
// directly, or change billing.
//
// Auth: Authorization: Bearer osk_...
// Docs: /developers

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateApiKey } from "../_shared/developer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ACTIVITY_EVENTS = [
  "email.sent",
  "email.held_for_review",
  "email.deferred",
  "email.review_approved",
  "email.review_skipped",
  "email.cancelled",
  "email.failed",
  "email.replied",
  "email.bounced",
  "email.unsubscribed",
  "followup.sent",
  "followup.cancelled",
  "booking.confirmed",
];

const SENTIMENT_BUCKETS: Record<string, string[]> = {
  interested: ["INTERESTED"],
  not_now: ["NOT_INTERESTED", "NOT_NOW", "MAYBE"],
  stop: ["STOP", "UNSUBSCRIBE", "UNSUBSCRIBED"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const identity = await authenticateApiKey(admin, req);
  if (!identity) return json({ error: "Invalid or missing API key" }, 401);
  if (identity.rateLimited) {
    return json({ error: "Rate limit: 120 requests per minute" }, 429);
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const apiAt = parts.indexOf("public-api");
  const path = parts.slice(apiAt + 1); // ["v1", ...]
  const route = path.slice(1).join("/");
  const userId = identity.userId;

  try {
    if (req.method === "GET" && (route === "" || route === "me")) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, name, company, plan, gmail_connected, created_at")
        .eq("id", userId)
        .maybeSingle();
      const { count: sends } = await admin
        .from("emails_sent")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return json({
        data: {
          ...profile,
          sends_lifetime: sends ?? 0,
          key_id: identity.keyId,
        },
      });
    }

    if (req.method === "GET" && route === "campaigns") {
      const { data: campaigns, error } = await admin
        .from("campaigns")
        .select("id, name, status, autopilot, followups_enabled, tone, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);

      const withCounts = await Promise.all(
        (campaigns ?? []).map(async (campaign) => {
          const [sent, replied, interested] = await Promise.all([
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", campaign.id),
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", campaign.id).eq("replied", true),
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", campaign.id)
              .ilike("reply_sentiment", "INTERESTED"),
          ]);
          return {
            ...campaign,
            sent: sent.count ?? 0,
            replied: replied.count ?? 0,
            interested: interested.count ?? 0,
          };
        }),
      );
      return json({ data: withCounts });
    }

    const campaignAction = /^campaigns\/([0-9a-f-]{36})\/(pause|resume)$/.exec(route);
    if (req.method === "POST" && campaignAction) {
      const [, campaignId, action] = campaignAction;
      const { data: campaign } = await admin
        .from("campaigns")
        .select("id, status")
        .eq("id", campaignId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);

      const { error } = await admin
        .from("campaigns")
        .update({ status: action === "pause" ? "paused" : "active" })
        .eq("id", campaignId)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ data: { id: campaignId, status: action === "pause" ? "paused" : "active" } });
    }

    if (req.method === "GET" && route === "stats") {
      const days = Math.min(3650, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
      const from = new Date(Date.now() - days * 86_400_000).toISOString();

      const base = () =>
        admin.from("emails_sent").select("id", { count: "exact", head: true })
          .eq("user_id", userId).gte("sent_at", from);

      const [sent, replied, interested, held, bounced] = await Promise.all([
        base(),
        base().eq("replied", true),
        base().ilike("reply_sentiment", "INTERESTED"),
        admin.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("event", "email.held_for_review").gte("created_at", from),
        admin.from("audit_events").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("event", "email.bounced").gte("created_at", from),
      ]);

      const sentCount = sent.count ?? 0;
      return json({
        data: {
          days,
          sent: sentCount,
          replied: replied.count ?? 0,
          interested: interested.count ?? 0,
          held_for_review: held.count ?? 0,
          bounced: bounced.count ?? 0,
          reply_rate: sentCount ? Number((((replied.count ?? 0) / sentCount) * 100).toFixed(1)) : 0,
          interested_rate: sentCount
            ? Number((((interested.count ?? 0) / sentCount) * 100).toFixed(1))
            : 0,
        },
      });
    }

    if (req.method === "GET" && route === "replies") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
      const bucket = url.searchParams.get("bucket") ?? "";
      let query = admin
        .from("emails_sent")
        .select("id, lead_id, campaign_id, subject, reply_sentiment, replied, sent_at, leads(name, company, email)")
        .eq("user_id", userId)
        .eq("replied", true)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (SENTIMENT_BUCKETS[bucket]) {
        query = query.in("reply_sentiment", SENTIMENT_BUCKETS[bucket]);
      }
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (req.method === "GET" && route === "activity") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
      const event = url.searchParams.get("event") ?? "";
      let query = admin
        .from("audit_events")
        .select("id, event, lead_id, campaign_id, payload, created_at")
        .eq("user_id", userId)
        .in("event", ACTIVITY_EVENTS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (event && ACTIVITY_EVENTS.includes(event)) query = query.eq("event", event);
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (req.method === "GET" && route === "leads") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
      const campaignId = url.searchParams.get("campaign_id");
      let query = admin
        .from("leads")
        .select("id, name, company, email, city, category, status, campaign_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (campaignId) query = query.eq("campaign_id", campaignId);
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    return json({ error: "Not found", paths: ["/v1/me", "/v1/campaigns", "/v1/stats", "/v1/replies", "/v1/leads", "/v1/activity"] }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
