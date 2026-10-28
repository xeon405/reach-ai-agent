// website-crawl — background email backfill for the shared business map.
//
// Every few hours, pick businesses in saved_businesses that have a website but
// no email yet, crawl their site for a published contact email (using the same
// polite enrichment engine the live search uses), verify it, and write it back
// into the same row. One crawl then benefits every future search by any user.
//
// Invoked by pg_cron with the x-cron-secret header; stops within a daily budget
// and never re-crawls a site more than once a month.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrichWebsiteEmails } from "../_shared/website-email-enrichment.ts";
import { verifyEmail } from "../_shared/email-verifier.ts";

const DAILY_CAP = 150;
const PER_RUN_MAX = 10;
const CONCURRENCY = 8;
const RECHECK_DAYS = 30;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function domainOf(website: string): string | undefined {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function bestEmail(emails: Awaited<ReturnType<typeof enrichWebsiteEmails>>["emails"]) {
  const rank = (t: string) => (t === "mailto" ? 2 : t === "text" ? 1 : 0);
  return emails.slice().sort((a, b) => rank(b.source_type) - rank(a.source_type) || b.confidence - a.confidence)[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Daily budget: cap minus how many rows we already attempted today.
  const todayIso = startOfTodayIso();
  const { count: used } = await supabase
    .from("saved_businesses")
    .select("id", { count: "exact", head: true })
    .gte("email_crawl_at", todayIso);
  const budget = Math.max(0, DAILY_CAP - (used ?? 0));
  if (budget <= 0) return json({ crawled: 0, found: 0, budget: 0, message: "daily crawl budget spent" });

  const recheckIso = new Date(Date.now() - RECHECK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("saved_businesses")
    .select("id, place_id, website, name")
    .is("email", null)
    .not("website", "is", null)
    .neq("website", "")
    .or(`email_crawl_at.is.null,email_crawl_at.lt.${recheckIso}`)
    // Newest discoveries first: when a user searches, their fresh businesses
    // (saved moments ago) should get emails before the multi-thousand-row
    // historical backlog, so a re-search shows results quickly.
    .order("last_seen", { ascending: false })
    .limit(Math.max(1, Math.min(budget, PER_RUN_MAX)));

  if (error) return json({ error: error.message }, 500);
  if (!rows || rows.length === 0) return json({ crawled: 0, found: 0, budget, message: "no candidates" });

  const list = rows;
  let found = 0;
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const row = list[idx++];
      try {
        const enrichment = await enrichWebsiteEmails(row.website);
        const best = bestEmail(enrichment.emails);
        const patch: Record<string, unknown> = { email_crawl_at: new Date().toISOString() };
        if (best) {
          const v = await verifyEmail(best.email, domainOf(row.website));
          patch.email = best.email;
          patch.email_source = best.source_type === "mailto" ? "website-mailto" : "website-text";
          patch.email_source_url = best.source_url;
          patch.email_status = v.status;
          patch.email_confidence = v.confidence;
          patch.email_is_role = v.is_role;
          patch.email_is_disposable = v.is_disposable;
          patch.email_verification_reason = v.reason;
        }
        const { error: upErr } = await supabase.from("saved_businesses").update(patch).eq("id", row.id);
        if (!upErr && best) found++;
      } catch (err) {
        console.error("website-crawl row failed:", row.place_id, err);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  return json({ crawled: rows.length, found, budget, remaining: Math.max(0, budget - rows.length) });
});