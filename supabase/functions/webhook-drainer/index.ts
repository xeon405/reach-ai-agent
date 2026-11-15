// WEBHOOK DELIVERY — task 13.
//
// audit_events fans out to webhook_outbox in Postgres (trigger). This function
// drains it every minute with an HMAC signature so receivers can verify the
// call came from us:
//
//   x-outshipai-event: email.sent
//   x-outshipai-signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<body>")>
//
// Six failed attempts marks the delivery failed; the endpoint stays active and
// its failure count is visible in Settings.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacSha256Hex } from "../_shared/developer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-requested-with, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MAX_ATTEMPTS = 6;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
  const isService = !!serviceKey && auth === `Bearer ${serviceKey}`;
  if (!isCron && !isService) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);

  const { data: deliveries, error } = await admin.rpc("claim_webhook_deliveries", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);
  if (!deliveries || deliveries.length === 0) return json({ ok: true, delivered: 0, failed: 0 });

  const endpointIds = [...new Set(deliveries.map((d: any) => d.endpoint_id))];
  const { data: endpoints } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, active, failure_count")
    .in("id", endpointIds);
  const byId = new Map((endpoints ?? []).map((e: any) => [e.id, e]));

  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const endpoint: any = byId.get(delivery.endpoint_id);
    if (!endpoint || !endpoint.active) {
      await admin.from("webhook_outbox").update({
        status: "failed",
        last_error: endpoint ? "endpoint_paused" : "endpoint_missing",
      }).eq("id", delivery.id);
      failed++;
      continue;
    }

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await hmacSha256Hex(endpoint.secret, `${timestamp}.${body}`);

    let status = 0;
    let errorText: string | null = null;
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "OutshipAi-Webhooks/1.0",
          "x-outshipai-event": delivery.event,
          "x-outshipai-delivery": String(delivery.id),
          "x-outshipai-signature": `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = response.status;
      if (!response.ok) errorText = `HTTP ${status}`;
    } catch (e) {
      errorText = e instanceof Error ? e.message : "network_error";
    }

    const now = new Date();
    if (!errorText) {
      await admin.from("webhook_outbox").update({
        status: "delivered",
        delivered_at: now.toISOString(),
        last_error: null,
      }).eq("id", delivery.id);
      await admin.from("webhook_endpoints").update({
        last_status: status,
        last_attempt_at: now.toISOString(),
        failure_count: 0,
      }).eq("id", endpoint.id);
      delivered++;
      continue;
    }

    const giveUp = delivery.attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(60, Math.pow(2, delivery.attempts) * 2);
    await admin.from("webhook_outbox").update({
      status: giveUp ? "failed" : "pending",
      last_error: errorText.slice(0, 300),
      next_attempt_at: giveUp
        ? now.toISOString()
        : new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
    }).eq("id", delivery.id);
    await admin.from("webhook_endpoints").update({
      last_status: status || null,
      last_attempt_at: now.toISOString(),
      failure_count: (endpoint.failure_count ?? 0) + 1,
    }).eq("id", endpoint.id);
    failed++;
  }

  return json({ ok: true, delivered, failed, claimed: deliveries.length });
});
