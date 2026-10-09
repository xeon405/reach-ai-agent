// ============================================================
// push-drainer — drains push_queue (filled by the owner_alerts
// trigger) and sends a web push to every registered device.
// Scheduled via pg_cron once a minute.
// Auth: x-cron-secret header only (matches send-worker).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webPush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const MAX_PER_RUN = 200;

function routeFor(kind: string | null, leadId: string | null): string {
  const root = leadId ? `/leads/${leadId}` : "";
  switch (kind) {
    case "first_reply":
    case "reply":
    case "booking":
    case "opt_out":
    case "handoff":
    case "takeover":
      return "/emails";
    case "intro_request":
      return "/leads";
    default:
      return root || "/";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const secret = Deno.env.get("CRON_SECRET");
    const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
    const health = new URL(req.url).searchParams.get("health") === "1";

    if (health) return new Response("push-drainer ok", { status: 200 });
    if (!isCron) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Run-marker: unconditional proof this invocation EXECUTED (health-check's
    // cron probe judges freshness on this, never on dispatch 'succeeded' alone).
    try {
      await insertAudit(supabase as any, {
        user_id: null,
        event: "push.drain.run",
        payload: { at: new Date().toISOString() },
      });
    } catch { /* marker is best-effort; the drain is authoritative */ }

    const pubKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:outshipai@gmail.com";
    webPush.setVapidDetails(subject, pubKey, privKey);

    let sent = 0;
    let deadSubs = 0;

    for (;;) {
      const { data: queue, error: qErr } = await supabase
        .from("push_queue")
        .select("id, user_id, title, body, kind, lead_id, priority")
        .order("id", { ascending: true })
        .limit(MAX_PER_RUN);
      if (qErr) throw new Error(qErr.message);
      if (!queue || queue.length === 0) break;

      for (const item of queue) {
        const { data: subs, error: sErr } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth_secret")
          .eq("user_id", item.user_id);
        if (sErr) {
          console.error("subscriptions fetch error:", sErr.message);
        } else if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title: item.title ?? "OutshipAi",
            body: item.body ?? "",
            kind: item.kind ?? "",
            url: routeFor(item.kind, item.lead_id),
          });
          await Promise.all(subs.map(async (sub: any) => {
            try {
              await webPush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
                },
                payload,
                {
                  TTL: 86400,
                  urgency: item.priority === "high" ? "high" : "normal",
                }
              );
              sent += 1;
            } catch (pushErr: any) {
              const code = pushErr?.statusCode;
              if (code === 404 || code === 410) {
                await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                deadSubs += 1;
              } else {
                console.error("push failed:", code, sub.endpoint.slice(0, 60), String(pushErr?.message ?? pushErr).slice(0, 120));
              }
            }
          }));
        }
        await supabase.from("push_queue").delete().eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, deadSubs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});