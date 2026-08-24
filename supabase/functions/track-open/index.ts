// TRACK-OPEN — 1x1 pixel. Records tracking_events + opened_at.
// An open is a weak signal (mail clients prefetch); replies/booking rule decisions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertAudit } from "../_shared/audit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIXEL = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  try {
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: row } = await admin.from("emails_sent").select("id, user_id, lead_id, campaign_id, opened").eq("id", id).maybeSingle();
      if (row) {
        await admin.from("emails_sent").update({ opened: true, opened_at: row.opened ? undefined : new Date().toISOString() }).eq("id", id);
        if (!row.opened) {
          await admin.from("tracking_events").insert({
            email_id: id,
            user_id: row.user_id,
            lead_id: row.lead_id,
            campaign_id: row.campaign_id,
            event: "open",
          });
          await insertAudit(admin, { user_id: row.user_id, campaign_id: row.campaign_id, lead_id: row.lead_id, event: "email.opened", payload: { email_id: id } });
        }
      }
    }
  } catch (_e) { /* never break the image */ }
  return new Response(PIXEL, { headers: { ...cors, "Content-Type": "image/gif", "Cache-Control": "no-store" } });
});
