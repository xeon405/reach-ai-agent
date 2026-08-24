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
    // NOTE: "c" (campaign) is accepted for compatibility but deliberately
    // ignored — an opt-out must suppress the lead EVERYWHERE, unconditionally.
    if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) {
      return new Response(JSON.stringify({ error: "missing lead" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data, error } = await admin
      .from("leads")
      .update({ unsubscribed: true, status: "unsubscribed" })
      .eq("id", leadId)
      .select("id");
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ ok: true, updated: data?.length ?? 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
