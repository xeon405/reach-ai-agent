import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO, nicheFor, searchDirectory } from "../_shared/osm.ts";
import { searchGoogleMaps, isGoogleMapsAvailable } from "../_shared/google-maps.ts";
import { recordGoogleSearches } from "../_shared/search-budget.ts";
import { insertAudit } from "../_shared/audit.ts";
import { verifyEmail, type EmailVerification } from "../_shared/email-verifier.ts";
import { planSearchQueries, curateLeads, isAiConfigured } from "../_shared/lead-ai.ts";
import { cacheGet, cacheSet, LEADS_TTL_MS } from "../_shared/search-cache.ts";
import {
  findSavedLeads, saveBusinesses, coverageStale, markCoverageRefreshed, grantRefresh,
} from "../_shared/saved-businesses.ts";

interface CachePayload {
  leads: unknown[];
  count: number;
  source: string;
  network: unknown[];
  ai: { planned: string | null; curated: string | null } | null;
  message: string;
}

type Lead = {
  name: string; email: string; company: string;
  job_title: string; country: string; city: string;
  website: string; phone: string; address: string;
  rating: number | null; source: string;
  category: string; place_id: string;
  email_source?: string; email_source_url?: string;
  email_status?: string; email_confidence?: number;
  email_is_role?: boolean; email_is_disposable?: boolean;
  email_verification_reason?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Live search crawls only a few websites inline to stay under the worker's 2s
// CPU limit (HTTP 546). The pages are now read with a hard byte cap (see
// website-email-enrichment.ts), so a handful is cheap; the remaining businesses
// come back email-less and are filled in shortly after by the background
// website-crawl job kicked off below.
const LIVE_ENRICH_LIMIT = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthedUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Not authenticated");
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let userId: string;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const body = await req.json().catch(() => ({}));
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret && typeof body.user_id === "string") {
      const { data: validUser } = await createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      ).from("profiles").select("id").eq("id", body.user_id).maybeSingle();
      if (!validUser) throw new Error("Invalid user_id");
      userId = body.user_id;
    } else {
      userId = await getAuthedUserId(req);
    }
    const { campaignId, jobTitle, country, location, limit = 25 } = body;
    if (!jobTitle) throw new Error("jobTitle is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("user_id", userId)
        .single();
      if (!campaign) throw new Error("Campaign not found");
    }

    const cappedLimit = Math.max(1, Math.min(Number(limit) || 25, 50));
    const cacheKey = [String(jobTitle), String(country ?? ""), String(location ?? "")]
      .map((s) => s.trim().toLowerCase()).join("|");

    // Serve fresh cached results first — quota is only spent on new chemistry.
    const cached = await cacheGet<CachePayload>(supabase, "leads", cacheKey);
    if (cached) {
      // Live search now returns most businesses email-less (bounded crawling);
      // the background website-crawl job fills their emails a little later.
      // Re-hydrate any that have since been filled so a repeat search shows them.
      const cachedLeads = (cached.leads ?? []) as Lead[];
      const missingIds = cachedLeads.filter((l) => !l.email && l.place_id).map((l) => l.place_id);
      if (missingIds.length > 0) {
        const { data: filled } = await supabase
          .from("saved_businesses")
          .select("place_id, email, email_source, email_source_url, email_status, email_confidence, email_is_role, email_is_disposable, email_verification_reason")
          .in("place_id", missingIds.slice(0, 100))
          .not("email", "is", null);
        const byId = new Map((filled ?? []).map((r) => [String(r.place_id), r]));
        for (const l of cachedLeads) {
          const f = l.place_id ? byId.get(String(l.place_id)) : undefined;
          if (!f?.email) continue;
          l.email = String(f.email);
          l.email_source = f.email_source ? String(f.email_source) : undefined;
          l.email_source_url = f.email_source_url ? String(f.email_source_url) : undefined;
          l.email_status = f.email_status ? String(f.email_status) : undefined;
          l.email_confidence = typeof f.email_confidence === "number" ? f.email_confidence : undefined;
          l.email_is_role = typeof f.email_is_role === "boolean" ? f.email_is_role : undefined;
          l.email_is_disposable = typeof f.email_is_disposable === "boolean" ? f.email_is_disposable : undefined;
          l.email_verification_reason = f.email_verification_reason ? String(f.email_verification_reason) : undefined;
        }
      }
      await insertAudit(supabase, {
        user_id: userId,
        campaign_id: campaignId,
        event: "lead.searched",
        payload: { count: cachedLeads.length, country, jobTitle, source: cached.source, cached: true },
      });
      return json({ ...cached, leads: cachedLeads, cached: true });
    }

    let leads: Lead[] = [];
    let source = "open-business-directory";
    let quotaHit = false;

    // Memory layer ("our own map"): permanent businesses from prior searches.
    // If we already own enough for this niche+area, serve instantly — no Google.
    const nicheKey = String(jobTitle).trim().toLowerCase();
    const countryStr = String(country ?? "United States").trim();
    const cityKey = location ? String(location).split(",")[0].trim().toLowerCase() : null;
    const remembered = await findSavedLeads(supabase, {
      niche: nicheKey,
      country: countryStr,
      location: location ? String(location) : undefined,
      limit: cappedLimit,
    });
    let refreshWanted = false;
    if (remembered.length >= cappedLimit && cityKey && (await coverageStale(supabase, nicheKey, countryStr, cityKey))) {
      refreshWanted = (await grantRefresh(supabase)) && isGoogleMapsAvailable();
    }
    const memoryFresh = !refreshWanted;
    if (remembered.length >= cappedLimit && memoryFresh) {
      await insertAudit(supabase, {
        user_id: userId,
        campaign_id: campaignId,
        event: "lead.searched",
        payload: { count: remembered.length, country, jobTitle, source: "database", from_memory: true },
      });
      return json({
        leads: remembered,
        count: remembered.length,
        source: "database",
        network: [],
        ai: { planned: null, curated: null },
        message: `Found ${remembered.length} saved businesses for "${jobTitle}"${country ? ` in ${country}` : ""} instantly from our own saved database — no live search needed. Try another city or niche to discover new ones.`,
        cached: false,
      });
    }

    // AI planning: expand the niche into search variants and (when no area was
    // typed) suggest strong metros. Optional — any failure falls back cleanly.
    const aiPlan = !location
      ? await planSearchQueries({
          jobTitle: String(jobTitle),
          country: country ?? "United States",
          limit: cappedLimit,
          userId,
        }).catch(() => null)
      : null;

    // Try Google Maps first if API key is configured
    if (isGoogleMapsAvailable()) {
      try {
        const extraAreas = !location && aiPlan?.areas?.length
          ? aiPlan.areas.map((a) => ({ query: a.query, cap: Math.max(5, Math.ceil(cappedLimit / 3)) }))
          : undefined;
        const gres = await searchGoogleMaps(
          jobTitle,
          country ?? "United States",
          cappedLimit,
          location,
          aiPlan?.variants ?? [],
          extraAreas,
          undefined,
          LIVE_ENRICH_LIMIT,
        );
        if (gres.quotaHit) quotaHit = true;
        await recordGoogleSearches(supabase, gres.apiCalls);
        if (gres.leads.length > 0) {
          leads = gres.leads.map((l) => ({
            name: l.name,
            email: l.email,
            company: l.company,
            job_title: l.job_title,
            country: l.country,
            city: l.city,
            website: l.website,
            phone: l.phone,
            address: l.address,
            rating: l.rating,
            source: l.source,
            category: l.category,
            place_id: l.place_id,
            email_source: l.email_source,
            email_source_url: l.email_source_url,
          }));
          source = "google-maps";
        }
      } catch (err) {
        console.error("Google Maps search failed:", err);
      }
    }

    if (leads.length === 0 && quotaHit) {
      if (remembered.length > 0) {
        return json({
          leads: remembered,
          count: remembered.length,
          source: "database",
          network: [],
          ai: { planned: null, curated: null },
          message: `Google Maps' daily search quota is used up, but here are ${remembered.length} business${remembered.length === 1 ? "" : "es"} saved from earlier searches. Live search resumes when the quota resets.`,
          cached: false,
          quota_exceeded: true,
        });
      }
      return json({
        leads: [],
        count: 0,
        source: "google-maps",
        network: [],
        ai: { planned: aiPlan?.note ?? null, curated: null },
        message:
          "Google Maps' daily search quota is used up for today, so no new searches could run. Results from earlier searches still work from cache. Either wait for the quota to reset or raise the Places API limit in Google Cloud, then retry.",
        quota_exceeded: true,
      });
    }

    // Fallback to OSM if Google Maps returned nothing or isn't configured
    if (leads.length === 0) {
      const iso =
        COUNTRY_ISO[String(country ?? "").toLowerCase().trim()] ??
        (String(country ?? "").length === 2 ? String(country).toUpperCase() : null);
      if (iso) {
        const niche = nicheFor(String(jobTitle));
        leads = await searchDirectory(niche, iso, cappedLimit);
        source = "open-business-directory";
      }
    }

    // Dedupe per business (same website host + city, or same company name when no
    // website): keep the lead with an email, prefer mailto-sourced emails.
    const bestByKey = new Map<string, typeof leads[number]>();
    for (const lead of leads) {
      const host = lead.website
        ? new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`).hostname.replace(/^www\./, "")
        : "";
      const company = String(lead.company || lead.name || "").toLowerCase().replace(/\s+/g, " ").trim();
      const key = host ? `${host}|${lead.city}` : company;
      if (!key) continue;
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, lead);
        continue;
      }
      const score = (l: typeof lead) => (l.email ? (l.email_source === "website-mailto" ? 2 : 1) : 0);
      if (score(lead) > score(existing)) bestByKey.set(key, lead);
    }
    leads = [...bestByKey.values()];

    // Warm network matches — other outreach businesses that opted in (no contact exposed).
    let network: Array<{
      target_user_id: string; business: string; company: string | null;
      offer: string; website_url: string | null; country: string | null; niche: string | null;
      matched: string[];
    }> = [];
    try {
      const terms = String(jobTitle ?? "")
        .toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).slice(0, 4);
      const { data: businesses } = await supabase
        .from("profiles")
        .select("id, name, company, offer, business_description, website_url, autopilot_country, autopilot_niche")
        .eq("network_mode", true).neq("id", userId).not("website_url", "is", null).limit(300);
      for (const b of businesses ?? []) {
        const hay = [b.name, b.company, b.offer, b.business_description, b.autopilot_niche]
          .filter(Boolean).join(" ").toLowerCase();
        if (!terms.length || !terms.some((t) => hay.includes(t))) continue;
        if (country && String(country).toLowerCase() !== "all" && b.autopilot_country) {
          const q = String(country).toLowerCase();
          const c = String(b.autopilot_country).toLowerCase();
          if (!q.includes(c) && !c.includes(q)) continue;
        }
        network.push({
          target_user_id: b.id,
          business: b.name || b.company || "A network business",
          company: b.company,
          offer: (b.offer || b.business_description || "").slice(0, 200),
          website_url: b.website_url,
          country: b.autopilot_country,
          niche: b.autopilot_niche,
          matched: terms.filter((t) => hay.includes(t)),
        });
        if (network.length >= 5) break;
      }
    } catch (netErr) {
      console.error("Network match lookup failed:", netErr);
    }

    await insertAudit(supabase, {
      user_id: userId,
      campaign_id: campaignId,
      event: "lead.searched",
      payload: { count: leads.length, country, jobTitle, source, network_matches: network.length },
    });

    // Verify emails in parallel — enrich each lead with verification data
    let verifiedLeads: Lead[] = await Promise.all(
      leads.map(async (lead) => {
        if (!lead.email) {
          return {
            ...lead,
            email_status: "unknown",
            email_confidence: 0,
            email_is_role: false,
            email_is_disposable: false,
            email_verification_reason: "no email found on website",
          };
        }
        const websiteDomain = lead.website
          ? new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`).hostname.replace(/^www\./, "")
          : undefined;
        const v: EmailVerification = await verifyEmail(lead.email, websiteDomain);
        return {
          ...lead,
          email_status: v.status,
          email_confidence: v.confidence,
          email_is_role: v.is_role,
          email_is_disposable: v.is_disposable,
          email_verification_reason: v.reason,
        };
      }),
    );

    // AI curation: pick the highest-value subset (relevance, email quality, local
    // independents, dedupe of same-brand repeats) and order it. Optional.
    let aiCurated: string | null = null;
    if (isAiConfigured() && verifiedLeads.length > 0) {
      const curated = await curateLeads({
        jobTitle: String(jobTitle),
        country: country ?? "United States",
        location,
        leads: verifiedLeads,
        limit: cappedLimit,
        userId,
      }).catch(() => null);
      if (curated && curated.order.length > 0) {
        const ordered = curated.order.map((i) => verifiedLeads[i]).filter(Boolean);
        if (ordered.length > 0) {
          verifiedLeads = ordered;
          aiCurated = curated.summary || null;
        }
      }
    }

    const withEmailCount = verifiedLeads.filter((l) => !!l.email).length;
    const pendingCount = verifiedLeads.length - withEmailCount;
    let message =
      leads.length === 0
        ? source === "google-maps"
          ? `No businesses found for "${jobTitle}" in ${country || "United States"}. Try another niche or country, or import a CSV.`
          : `No businesses found for "${jobTitle}" in ${country || "United States"}. Try "dentist", "gym", "restaurant", "salon", "lawyer" — or import a CSV.`
        : `Found ${verifiedLeads.length} businesses (${source}). ${withEmailCount} have emails ready${
            pendingCount > 0
              ? `; the other ${pendingCount} are being fetched in the background and will appear shortly`
              : ""
          }. Review and add the ones you want.`;
    if (aiCurated) message += ` AI: ${aiCurated}`;

    // Grow "our own map": merge any remembered rows not already shown, then save
    // everything (live + remembered) back to the permanent ledger.
    if (remembered.length > 0) {
      const seenEmails = new Set(verifiedLeads.map((l) => String(l.email).toLowerCase()));
      for (const r of remembered) {
        if (seenEmails.has(String(r.email).toLowerCase())) continue;
        seenEmails.add(String(r.email).toLowerCase());
        verifiedLeads.push(r);
      }
      verifiedLeads = verifiedLeads.slice(0, cappedLimit);
    }
    await saveBusinesses(supabase, verifiedLeads, nicheKey, countryStr);
    if (cityKey) await markCoverageRefreshed(supabase, nicheKey, countryStr, cityKey, String(location ?? ""));

    // Some businesses came back without an email (we no longer crawl inline to
    // dodge the 2s CPU limit). Kick the background crawler right away so their
    // emails are filled shortly after this response — fire-and-forget, so the
    // search still returns immediately.
    if (verifiedLeads.some((l) => !l.email)) {
      const crawlSecret = Deno.env.get("CRON_SECRET");
      const crawlUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/website-crawl`;
      if (crawlSecret) {
        const kickoff = fetch(crawlUrl, { method: "POST", headers: { "x-cron-secret": crawlSecret } })
          .then(() => {})
          .catch(() => {});
        const et = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (et?.waitUntil) et.waitUntil(kickoff);
      }
    }

    // Cache the finished result so the next identical request (within TTL) is
    // served without spending more Places quota or re-enriching websites.
    const payload: CachePayload = { leads: verifiedLeads, count: verifiedLeads.length, source, network, ai: { planned: aiPlan?.note ?? null, curated: aiCurated }, message };
    if (!quotaHit && verifiedLeads.length > 0) {
      await cacheSet(supabase, "leads", cacheKey, payload, LEADS_TTL_MS);
    }

    return json({ ...payload, cached: false });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
