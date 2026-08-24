import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("l");
    const campaignId = url.searchParams.get("c");
    if (!leadId) {
      return new Response(JSON.stringify({ error: "missing lead" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    let q = admin.from("leads").update({ unsubscribed: true, status: "unsubscribed" }).eq("id", leadId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
