// SEND-CAMPAIGN — enqueue only. All sending lives in `send-worker`.
// Campaigns create jobs in send_queue; workers claim them safely.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO } from "../_shared/osm.ts";
import { insertAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 40;

const PLAN_LIMITS: Record<string, { dailyEmails: number }> = {
  free: { dailyEmails: 10 },
  starter: { dailyEmails: 50 },
  growth: { dailyEmails: 200 },
  agency: { dailyEmails: 500 },
};

const COUNTRY_TZ: Record<string, [number, number]> = {
  US: [-8, -5], CA: [-8, -3.5], GB: [0, 0], IE: [0, 0], PT: [0, 0],
  ES: [1, 1], FR: [1, 1], BE: [1, 1], NL: [1, 1], DE: [1, 1], CH: [1, 1], AT: [1, 1], IT: [1, 1],
  SE: [1, 1], NO: [1, 1], DK: [1, 1], FI: [2, 2], PL: [1, 1], CZ: [1, 1], HU: [1, 1], RO: [2, 2], GR: [2, 2],
  TR: [3, 3], RU: [3, 3], UA: [2, 2],
  IN: [5.5, 5.5], PK: [5, 5], BD: [6, 6], LK: [5.5, 5.5], NP: [5.75, 5.75],
  CN: [8, 8], HK: [8, 8], TW: [8, 8], JP: [9, 9], KR: [9, 9], SG: [8, 8], MY: [8, 8],
  TH: [7, 7], VN: [7, 7], PH: [8, 8], ID: [7, 8],
  AU: [8, 11], NZ: [12, 13],
  BR: [-3, -2], AR: [-3, -3], CL: [-4, -4], CO: [-5, -5], MX: [-6, -6], PE: [-5, -5],
  ZA: [2, 2], NG: [1, 1], KE: [3, 3], GH: [0, 0], EG: [2, 2],
  SA: [3, 3], AE: [4, 4], KW: [3, 3], QA: [3, 3], BH: [3, 3], OM: [4, 4],
  JO: [3, 3], LB: [2, 2], IQ: [3, 3], PS: [2, 2], YE: [3, 3], LY: [2, 2], TN: [1, 1], DZ: [1, 1], MA: [1, 1], SD: [2, 2], SY: [3, 3],
  IL: [2, 2],
};

function normalizeCountry(country: string | null | undefined): string | null {
  const raw = String(country ?? "").trim();
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_ISO[raw.toLowerCase()] ?? raw.toUpperCase().slice(0, 2);
}

function tzOffsetFor(country: string | null | undefined): number {
  const iso = normalizeCountry(country);
  return iso ? COUNTRY_TZ[iso]?.[0] ?? 0 : 0;
}

function isBusinessMorning(country: string | null | undefined): boolean {
  const local = (new Date().getUTCHours() + tzOffsetFor(country) + 24) % 24;
  return local >= 8 && local < 11;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    let userId: string;
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret && typeof body.user_id === "string") {
      userId = body.user_id;
    } else {
      userId = await getAuthedUserId(req);
    }
    const campaignId: string = body.campaignId ?? body.campaign_id;
    if (!campaignId) throw new Error("campaignId is required");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Eligibility gates at enqueue time (the worker re-checks everything again)
    const { data: campaign } = await supabase.from("campaigns").select("id, status, ab_test").eq("id", campaignId).eq("user_id", userId).single();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "active") throw new Error("Campaign is not active");

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!profile) throw new Error("Profile not found");

    const { data: tokenRow } = await supabase.from("gmail_tokens").select("refresh_token").eq("profile_id", userId).single();
    if (!profile.gmail_connected || !tokenRow?.refresh_token) throw new Error("Gmail not connected. Connect it in Settings first.");

    const limits = PLAN_LIMITS[profile.plan ?? "starter"] ?? PLAN_LIMITS.starter;
    const daysWarm = Math.max(0, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000));
    const dailyCap = Math.min(limits.dailyEmails, 5 + daysWarm * 5);
    const today = new Date().toISOString().split("T")[0];
    const sentTodayBase = profile.emails_sent_date === today ? (profile.emails_sent_today ?? 0) : 0;
    const remainingToday = dailyCap - sentTodayBase;
    if (remainingToday <= 0) {
      return json({ queued: 0, error: `Daily limit reached (warm-up cap: ${dailyCap}/day while your sender builds reputation).` }, 429);
    }

    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, country, created_at")
      .eq("campaign_id", campaignId)
      .eq("status", "new")
      .eq("unsubscribed", false)
      .limit(Math.min(BATCH_SIZE, remainingToday));

    if (!leads || leads.length === 0) return json({ queued: 0, message: "No new leads to email" });

    // Global dedupe: never email the same person twice — across ALL campaigns
    const batchEmails = leads.map((l: { email?: string | null }) => String(l.email ?? "").toLowerCase()).filter(Boolean);
    const dupeIds = new Set<string>();
    if (batchEmails.length > 0) {
      const { data: sameEmailLeads } = await supabase.from("leads").select("id, email").eq("user_id", userId).in("email", batchEmails).limit(2000);
      const emailToLeadIds = new Map<string, string[]>();
      for (const l of sameEmailLeads ?? []) {
        const key = String(l.email).toLowerCase();
        emailToLeadIds.set(key, [...(emailToLeadIds.get(key) ?? []), l.id]);
      }
      const allRelated = [...emailToLeadIds.values()].flat();
      if (allRelated.length > 0) {
        const { data: emailed } = await supabase.from("emails_sent").select("lead_id").in("lead_id", allRelated).limit(5000);
        const emailedSet = new Set((emailed ?? []).map((r: { lead_id: string }) => r.lead_id));
        for (const l of leads) {
          const related = emailToLeadIds.get(String(l.email ?? "").toLowerCase()) ?? [];
          if (related.some((id) => emailedSet.has(id))) dupeIds.add(l.id);
        }
        if (dupeIds.size > 0) {
          await supabase.from("leads").update({ status: "skipped" }).in("id", [...dupeIds]);
          for (const id of dupeIds) await insertAudit(supabase, { user_id: userId, campaign_id: campaignId, lead_id: id, event: "lead.duplicate_blocked", payload: {} });
        }
      }
    }
    const freshLeads = (leads as Array<{ id: string; email?: string | null; country?: string | null }>).filter((l) => !dupeIds.has(l.id));
    if (freshLeads.length === 0) return json({ queued: 0, message: `${dupeIds.size} duplicates skipped` });

    // Fast-fail MX pre-check (worker re-validates; bounce handling stays separate)
    const invalidLeadIds: string[] = [];
    const domainCache = new Map<string, boolean>();
    for (const l of freshLeads) {
      const domain = String(l.email ?? "").split("@")[1]?.toLowerCase().trim();
      if (!domain || !/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(String(l.email))) { invalidLeadIds.push(l.id); continue; }
      if (!domainCache.has(domain)) {
        try {
          const mx = await Deno.resolveDns(domain, "MX");
          domainCache.set(domain, Array.isArray(mx) && mx.length > 0);
        } catch { domainCache.set(domain, false); }
      }
      if (!domainCache.get(domain)) invalidLeadIds.push(l.id);
    }
    if (invalidLeadIds.length > 0) {
      await supabase.from("leads").update({ status: "invalid" }).in("id", invalidLeadIds);
      await insertAudit(supabase, { user_id: userId, campaign_id: campaignId, event: "lead.invalid_mx", payload: { count: invalidLeadIds.length } });
    }
    const deliverable = freshLeads.filter((l) => !invalidLeadIds.includes(l.id));
    if (deliverable.length === 0) return json({ queued: 0, message: `${invalidLeadIds.length} undeliverable emails skipped` });

    const eligible = deliverable.filter((l: { country?: string | null }) => isBusinessMorning(l.country));
    const waiting = deliverable.length - eligible.length;

    // Idempotency: uniq_queue_job blocks duplicate live jobs per (campaign, lead)
    const rows = eligible.map((l: { id: string }, i: number) => ({
      user_id: userId,
      campaign_id: campaignId,
      lead_id: l.id,
      variant: campaign.ab_test ? (i % 2 === 0 ? "A" : "B") : null,
    }));
    let inserted = rows.length;
    if (rows.length > 0) {
      const { data: insertedRows, error: qErr } = await supabase.from("send_queue").insert(rows).select("id");
      if (qErr) throw new Error(`Queue error: ${qErr.message}`);
      inserted = insertedRows?.length ?? 0;
      for (const r of insertedRows ?? []) {
        await insertAudit(supabase, { user_id: userId, campaign_id: campaignId, event: "email.queued", payload: { job_id: r.id } });
      }
    }

    // Kick the worker without blocking the response
    const kickoff = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: "{}",
    }).then((r) => r.text()).catch(() => "");
    const et = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (et?.waitUntil) et.waitUntil(kickoff);

    const parts: string[] = [];
    if (inserted > 0) parts.push(`${inserted} email${inserted === 1 ? "" : "s"} queued — sending one by one in the background`);
    if (waiting > 0) parts.push(`${waiting} waiting for their local morning`);
    if (invalidLeadIds.length > 0) parts.push(`${invalidLeadIds.length} undeliverable skipped`);
    if (dupeIds.size > 0) parts.push(`${dupeIds.size} duplicates skipped`);

    await insertAudit(supabase, { user_id: userId, campaign_id: campaignId, event: "campaign.started", payload: { queued: inserted } });

    return json({
      queued: inserted,
      message: parts.join(" · ") || "Nothing new to send",
      remainingToday: Math.max(remainingToday - inserted, 0),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
