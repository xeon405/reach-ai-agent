import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, groqKeys } from "../_shared/groq.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userId = await getAuthedUserId(req);

    // M2: atomic daily AI quota (default cap 200/day, env-overridable)
    const cap = Number(Deno.env.get("AI_DAILY_CAP") ?? 200);
    const { data: allowed, error: quotaError } = await supabase.rpc("consume_ai_quota", {
      uid: userId,
      cap,
    });
    if (quotaError) throw new Error(quotaError.message);
    if (!allowed) {
      return json({ error: "Daily AI limit reached. Try again tomorrow or upgrade your plan." }, 429);
    }

    const { leadName, leadCompany, leadJobTitle, yourCompany, yourOffer } = await req.json();
    if (!leadName || !leadCompany || !leadJobTitle) {
      throw new Error("leadName, leadCompany and leadJobTitle are required");
    }
    if (groqKeys().length === 0) throw new Error("No GROQ API keys configured");

    const content = await groqChat([{
      role: "user",
      content: `Write a short, personalized cold email from ${yourCompany ?? "our company"} to ${leadName} who is a ${leadJobTitle} at ${leadCompany}.
Our offer: ${yourOffer ?? "our service"}
Rules:
- Maximum 5 sentences
- Sound human and genuine, not salesy
- Reference their specific role
- End with a simple question
- No subject line, just the email body
- Sign off with "Best regards"`,
    }], { maxTokens: 800 });

    return json({ content });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
