import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Verify campaign ownership if a campaign was specified
    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("user_id", userId)
        .single();
      if (!campaign) throw new Error("Campaign not found");
    }

    // Search Apollo for leads
    const apolloRes = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": Deno.env.get("APOLLO_API_KEY")!,
      },
      body: JSON.stringify({
        person_titles: [jobTitle],
        person_locations: country ? [country] : undefined,
        page: 1,
        per_page: Math.min(Number(limit) || 25, 100),
        contact_email_status: ["verified", "guessed"],
      }),
    });

    if (!apolloRes.ok) {
      const errText = await apolloRes.text();
      throw new Error(`Apollo API error (${apolloRes.status}): ${errText.slice(0, 300)}`);
    }

    const apolloData = await apolloRes.json();

    if (!apolloData.people || apolloData.people.length === 0) {
      return json({ found: 0, added: 0, message: "No leads found for this criteria" });
    }

    let added = 0;

    for (const person of apolloData.people) {
      const email = person.email;
      if (!email) continue;

      // Check if lead already exists
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) continue;

      await supabase.from("leads").insert({
        user_id: userId,
        campaign_id: campaignId || null,
        name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim(),
        email,
        company: person.organization?.name ?? null,
        job_title: person.title ?? null,
        country: person.country ?? null,
        status: "new",
      });

      added++;
    }

    return json({ found: apolloData.people.length, added });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
