// MCP CONNECTOR — task 14.
//
// A stateless Streamable-HTTP MCP server. Point Claude or ChatGPT at:
//   https://<project>.supabase.co/functions/v1/mcp
// with header  Authorization: Bearer osk_...
//
// Tools read the key owner's own data and can pause/resume a campaign. No tool
// can send an email, change billing, or read another account.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateApiKey } from "../_shared/developer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "list_campaigns",
    description:
      "List this account's campaigns with sent, replied and interested counts. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_stats",
    description:
      "Outreach totals for the last N days: sent, replied, interested, held for review, bounced, and rates. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 3650, description: "Defaults to 30." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_replies",
    description:
      "Recent replies, with the reply sentiment. Filter by bucket: interested, not_now or stop. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", enum: ["interested", "not_now", "stop"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_activity",
    description:
      "The email log: why each email was sent, held for review, cancelled, failed or replied. Includes the reason and proof counts. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "Optional exact event, e.g. email.held_for_review." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_leads",
    description: "Recent leads, optionally for one campaign. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "UUID of a campaign." },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "pause_campaign",
    description: "Pause one of this account's campaigns. Stops queued sends for it.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string", description: "UUID of the campaign." } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
  },
  {
    name: "resume_campaign",
    description: "Resume one of this account's paused campaigns.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string", description: "UUID of the campaign." } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
  },
];

const SENTIMENT_BUCKETS: Record<string, string[]> = {
  interested: ["INTERESTED"],
  not_now: ["NOT_INTERESTED", "NOT_NOW", "MAYBE"],
  stop: ["STOP", "UNSUBSCRIBE", "UNSUBSCRIBED"],
};

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rpcResult(id: unknown, result: unknown) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, code: number, message: string) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

function toolText(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const identity = await authenticateApiKey(admin, req);
  if (!identity) return json({ error: "Invalid or missing API key" }, 401);
  if (identity.rateLimited) return json({ error: "Rate limit: 120 requests per minute" }, 429);
  const userId = identity.userId;

  if (req.method === "GET") {
    return json({
      name: "outshipai",
      protocolVersion: PROTOCOL_VERSION,
      transport: "streamable-http",
      tools: TOOLS.map((t) => t.name),
    });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  // Batches are not part of MCP 2025-06-18; reject them clearly.
  if (Array.isArray(body)) return rpcError(null, -32600, "Batch requests are not supported");

  const id = body?.id ?? null;
  const method = String(body?.method ?? "");

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "outshipai", version: "1.0.0" },
      instructions:
        "OutshipAi data for this API key's owner. Read tools return real, unscaled numbers. No tool can send email.",
    });
  }

  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Method not found: ${method}`);
  }

  const name = String(body?.params?.name ?? "");
  const args = body?.params?.arguments ?? {};
  if (!TOOLS.some((t) => t.name === name)) {
    return rpcError(id, -32602, `Unknown tool: ${name}`);
  }

  try {
    if (name === "list_campaigns") {
      const { data: campaigns } = await admin
        .from("campaigns")
        .select("id, name, status, autopilot, followups_enabled, tone, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = await Promise.all(
        (campaigns ?? []).map(async (c) => {
          const [sent, replied, interested] = await Promise.all([
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", c.id),
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", c.id).eq("replied", true),
            admin.from("emails_sent").select("id", { count: "exact", head: true })
              .eq("user_id", userId).eq("campaign_id", c.id)
              .ilike("reply_sentiment", "INTERESTED"),
          ]);
          return { ...c, sent: sent.count ?? 0, replied: replied.count ?? 0, interested: interested.count ?? 0 };
        }),
      );
      return rpcResult(id, toolText(rows));
    }

    if (name === "get_stats") {
      const days = Math.min(3650, Math.max(1, Number(args.days ?? 30) || 30));
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
      return rpcResult(id, toolText({
        days,
        sent: sentCount,
        replied: replied.count ?? 0,
        interested: interested.count ?? 0,
        held_for_review: held.count ?? 0,
        bounced: bounced.count ?? 0,
        reply_rate: sentCount ? Number((((replied.count ?? 0) / sentCount) * 100).toFixed(1)) : 0,
        interested_rate: sentCount ? Number((((interested.count ?? 0) / sentCount) * 100).toFixed(1)) : 0,
      }));
    }

    if (name === "list_replies") {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25) || 25));
      let query = admin
        .from("emails_sent")
        .select("id, lead_id, campaign_id, subject, reply_sentiment, replied, sent_at, leads(name, company, email)")
        .eq("user_id", userId)
        .eq("replied", true)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (SENTIMENT_BUCKETS[String(args.bucket ?? "")]) {
        query = query.in("reply_sentiment", SENTIMENT_BUCKETS[String(args.bucket)]);
      }
      const { data } = await query;
      return rpcResult(id, toolText(data ?? []));
    }

    if (name === "list_activity") {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 50) || 50));
      let query = admin
        .from("audit_events")
        .select("id, event, lead_id, campaign_id, payload, created_at")
        .eq("user_id", userId)
        .in("event", ACTIVITY_EVENTS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (ACTIVITY_EVENTS.includes(String(args.event ?? ""))) {
        query = query.eq("event", String(args.event));
      }
      const { data } = await query;
      return rpcResult(id, toolText(data ?? []));
    }

    if (name === "list_leads") {
      const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25) || 25));
      let query = admin
        .from("leads")
        .select("id, name, company, email, city, category, status, campaign_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.campaign_id) query = query.eq("campaign_id", String(args.campaign_id));
      const { data } = await query;
      return rpcResult(id, toolText(data ?? []));
    }

    if (name === "pause_campaign" || name === "resume_campaign") {
      const campaignId = String(args.campaign_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(campaignId)) {
        return rpcResult(id, toolText({ error: "campaign_id must be a UUID" }, true));
      }
      const { data: campaign } = await admin
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!campaign) return rpcResult(id, toolText({ error: "Campaign not found" }, true));

      const status = name === "pause_campaign" ? "paused" : "active";
      const { error } = await admin
        .from("campaigns")
        .update({ status })
        .eq("id", campaignId)
        .eq("user_id", userId);
      if (error) return rpcResult(id, toolText({ error: error.message }, true));
      return rpcResult(id, toolText({ id: campaignId, status }));
    }

    return rpcError(id, -32602, `Unknown tool: ${name}`);
  } catch (e) {
    return rpcResult(id, toolText({ error: e instanceof Error ? e.message : "Unexpected error" }, true));
  }
});
