import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO, nicheFor, searchDirectory } from "../_shared/osm.ts";
import { searchGoogleMaps, isGoogleMapsAvailable } from "../_shared/google-maps.ts";
import { insertAudit } from "../_shared/audit.ts";
import { verifyEmail, type EmailVerification } from "../_shared/email-verifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      userId = body.user_id;
    } else {
      userId = await getAuthedUserId(req);
    }
    const { campaignId, jobTitle, country, limit = 25 } = body;
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
    let leads: Array<{
      name: string; email: string; company: string;
      job_title: string; country: string; city: string;
      website: string; phone: string; address: string;
      rating: number | null; source: string;
      category: string; place_id: string;
      email_status?: string; email_confidence?: number;
      email_is_role?: boolean; email_is_disposable?: boolean;
      email_verification_reason?: string;
    }> = [];
    let source = "open-business-directory";

    // Try Google Maps first if API key is configured
    if (isGoogleMapsAvailable()) {
      try {
        const googleLeads = await searchGoogleMaps(jobTitle, country ?? "United States", cappedLimit);
        if (googleLeads.length > 0) {
          leads = googleLeads.map((l) => ({
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
          }));
          source = "google-maps";
        }
      } catch (err) {
        // Google Maps failed — fallback to OSM below
        console.error("Google Maps search failed, falling back to OSM:", err);
      }
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

    await insertAudit(supabase, {
      user_id: userId,
      campaign_id: campaignId,
      event: "lead.searched",
      payload: { count: leads.length, country, jobTitle, source },
    });

    // Verify emails in parallel — enrich each lead with verification data
    const verifiedLeads = await Promise.all(
      leads.map(async (lead) => {
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

    return json({
      leads: verifiedLeads,
      count: verifiedLeads.length,
      source,
      message:
        leads.length === 0
          ? source === "google-maps"
            ? `No businesses with public emails found for "${jobTitle}" in ${country}. Try another niche or country, or import a CSV.`
            : `No public emails found for "${jobTitle}" in ${country}. Try "dentist", "gym", "restaurant", "salon", "lawyer" — or import a CSV.`
          : `Found ${leads.length} businesses with public emails (${source}). Review and add the ones you want.`,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
