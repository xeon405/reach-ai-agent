const cors = {
  "Access-Control-Allow-Origin": "*",
};

// 1x1 transparent GIF
const PIXEL = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0xff, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b]);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("emails_sent").update({ opened: true }).eq("id", id);
    } catch (_e) {
      // never fail the pixel — always return the image
    }
  }
  return new Response(PIXEL, {
    headers: { ...cors, "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
});
