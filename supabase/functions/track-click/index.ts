// TRACK-CLICK — URL redirect with click recording.
// Wraps outbound links in emails. Records tracking_events + updates emails_sent.
// An open is a weak signal; a click is a strong signal of interest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const dest = url.searchParams.get("url");

  if (!id || !dest || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Missing parameters", { status: 400, headers: cors });
  }

  // Validate destination is a real URL
  let destUrl: URL;
  try {
    destUrl = new URL(dest);
    if (!["http:", "https:"].includes(destUrl.protocol)) throw new Error("bad protocol");
  } catch {
    return new Response("Invalid destination", { status: 400, headers: cors });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin
      .from("emails_sent")
      .select("id, user_id, lead_id, campaign_id")
      .eq("id", id)
      .maybeSingle();

    if (row) {
      // Record click event (idempotent — multiple clicks are fine)
      await admin.from("tracking_events").insert({
        email_id: id,
        user_id: row.user_id,
        lead_id: row.lead_id,
        campaign_id: row.campaign_id,
        event: "click",
      });

      // Audit trail (only first click gets logged to avoid noise)
      const { count } = await admin
        .from("tracking_events")
        .select("id", { count: "exact", head: true })
        .eq("email_id", id)
        .eq("event", "click");

      if (count === 1) {
        await insertAudit(admin, {
          user_id: row.user_id,
          campaign_id: row.campaign_id,
          lead_id: row.lead_id,
          event: "email.clicked",
          payload: { email_id: id, url: destUrl.href.slice(0, 200) },
        });
      }
    }
  } catch (_e) { /* never block the redirect */ }

  // 302 redirect to destination
  return Response.redirect(destUrl.href, 302);
});
