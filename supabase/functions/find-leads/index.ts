import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { COUNTRY_ISO, nicheFor, searchDirectory, type Niche } from "../_shared/osm.ts";
import { insertAudit } from "../_shared/audit.ts";

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
    const userId = await getAuthedUserId(req);
    const { campaignId, jobTitle, country, limit = 25 } = await req.json();
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

    const iso =
      COUNTRY_ISO[String(country ?? "").toLowerCase().trim()] ??
      (String(country ?? "").length === 2 ? String(country).toUpperCase() : null);
    if (!iso) throw new Error(`Unsupported country "${country}". Try e.g. United States, United Kingdom, India…`);

    const cappedLimit = Math.max(1, Math.min(Number(limit) || 25, 50));
    const niche = nicheFor(String(jobTitle));
    const leads = await searchDirectory(niche, iso, cappedLimit);

    if (leads.length > 0) {
      const rows = leads.map((l) => ({
        user_id: userId,
        campaign_id: campaignId ?? null,
        ...l,
        status: "new",
      }));
      // Insert one by one so a single duplicate doesn't crash the whole batch.
      let saved = 0;
      for (const row of rows) {
        const { error: insErr } = await supabase.from("leads").insert(row);
        if (!insErr) saved++;
      }
      await insertAudit(supabase, { user_id: userId, campaign_id: campaignId, event: "lead.imported", payload: { count: leads.length, saved, source: "open-business-directory" } });
    }

    return json({
      found: leads.length,
      saved: leads.length,
      source: "open-business-directory",
      message:
        leads.length === 0
          ? `No public emails listed for "${jobTitle}" in ${country}. Try another niche (dentist, gym, restaurant, salon, lawyer…) or import a CSV.`
          : `Found ${leads.length} businesses with public emails and saved them to your leads.`,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
