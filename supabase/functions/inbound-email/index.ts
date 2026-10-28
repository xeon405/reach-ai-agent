// Inbound reply webhook. SendGrid Inbound Parse POSTs here for any mail sent
// to r-<leadId>@<EMAIL_INBOUND_DOMAIN>. We resolve the lead, persist the reply,
// mark the thread replied, and raise an owner alert — no Gmail read scope.
//
// Deployed with verify_jwt OFF (the provider cannot send our JWT).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";
import { nextLifecycle } from "../_shared/policy.ts";
import { parseInboundLeadId } from "../_shared/reply-address.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Accepts SendGrid's multipart/form-data body, or a JSON body for testing. */
async function readFields(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  }
  const j = await req.json().catch(() => ({}));
  return j as Record<string, string>;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const f = await readFields(req);
    const to = String(f.to ?? "");
    const from = String(f.from ?? "");
    const subject = String(f.subject ?? "");
    let text = String(f.text ?? "");
    const html = String(f.html ?? "");
    if (!text.trim() && html) text = htmlToText(html);

    const leadId = parseInboundLeadId(to);
    if (!leadId) return json({ ok: false, reason: "no_lead_token" }, 200);

    const { data: lead } = await supabase
      .from("leads")
      .select("id, user_id, campaign_id, email, name, lifecycle, status, unsubscribed")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return json({ ok: false, reason: "lead_not_found" }, 200);

    const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    const clean = text.replace(/\s+/g, " ").trim();
    const contentHash = await sha256(`${fromEmail}|${to}|${subject}|${clean}`.toLowerCase());

    const { data: existing } = await supabase
      .from("inbound_emails").select("id").eq("content_hash", contentHash).maybeSingle();
    if (existing) return json({ ok: true, duplicate: true });

    await supabase.from("inbound_emails").insert({
      user_id: lead.user_id,
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      from_email: fromEmail,
      to_email: to,
      subject: subject.slice(0, 400),
      body_text: text.slice(0, 20000),
      body_html: html.slice(0, 50000),
      content_hash: contentHash,
    });

    const snippet = clean.slice(0, 280);

    // Opt-out intent: honour immediately, no AI needed.
    const wantsUnsub = /\b(unsubscribe|remove me|stop emailing|opt[\s-]?out|take me off|don'?t (?:email|contact) me)\b/i.test(clean);
    if (wantsUnsub) {
      await supabase.from("leads").update({
        unsubscribed: true,
        status: "unsubscribed",
        lifecycle: nextLifecycle(lead.lifecycle ?? "CONTACTED", "email.unsubscribed"),
      }).eq("id", lead.id);
      await supabase.from("suppressions").insert({
        user_id: lead.user_id, lead_id: lead.id, email: lead.email, reason: "unsubscribe", source: "inbound_reply",
      });
      await supabase.from("owner_alerts").insert({
        user_id: lead.user_id, lead_id: lead.id, kind: "opt_out",
        title: `🚫 ${lead.name ?? lead.email} opted out`, body: snippet, priority: "normal",
      });
      await insertAudit(supabase, {
        user_id: lead.user_id, campaign_id: lead.campaign_id, lead_id: lead.id,
        event: "email.unsubscribed", payload: { source: "inbound-email", from: fromEmail },
      });
      return json({ ok: true, action: "unsubscribed" });
    }

    // Mark the latest outbound message replied + advance the lead.
    const { data: es } = await supabase
      .from("emails_sent").select("id").eq("lead_id", lead.id)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (es) await supabase.from("emails_sent").update({ replied: true }).eq("id", es.id);

    if (!["replied", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED"].includes(lead.status ?? "")) {
      await supabase.from("leads").update({
        status: "replied",
        lifecycle: nextLifecycle(lead.lifecycle ?? "CONTACTED", "email.replied"),
      }).eq("id", lead.id);
    }

    await supabase.from("owner_alerts").insert({
      user_id: lead.user_id, lead_id: lead.id, kind: "first_reply",
      title: `💬 ${lead.name ?? lead.email} replied`,
      body: snippet || "(no readable text)",
      priority: "normal",
    });

    await insertAudit(supabase, {
      user_id: lead.user_id, campaign_id: lead.campaign_id, lead_id: lead.id,
      event: "email.replied",
      payload: { source: "inbound-email", from: fromEmail, subject: subject.slice(0, 150) },
    });

    return json({ ok: true, action: "recorded" });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
  }
});
