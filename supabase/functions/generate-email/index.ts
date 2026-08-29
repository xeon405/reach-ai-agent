import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, groqKeys, sanitizeForPrompt } from "../_shared/groq.ts";
import { COLD_EMAIL_FEWSHOTS, containsArabic, pickOpenerDirective } from "../_shared/ai-lib.ts";

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

    // Sender identity: real name/signature so the AI never signs "[Your Name]"
    const { data: prof } = await supabase
      .from("profiles")
      .select("name, company, signature, booking_link")
      .eq("id", userId)
      .single();
    const senderName = sanitizeForPrompt(prof?.name ?? "", 60);
    const senderSig = sanitizeForPrompt(prof?.signature ?? "", 200);
    const bookingLink = sanitizeForPrompt(prof?.booking_link ?? "", 300);

    const arabic = containsArabic(leadName) || containsArabic(leadCompany);
    const openerDirective = pickOpenerDirective(`${sanitizeForPrompt(leadName, 80)}-${sanitizeForPrompt(leadCompany, 120)}`);

    const content = await groqChat([{
      role: "user",
      content: `Write a short, personalized cold email from ${senderName || "a representative"} at ${sanitizeForPrompt(yourCompany ?? prof?.company ?? "our company", 120)} to ${sanitizeForPrompt(leadName, 80)} who is a ${sanitizeForPrompt(leadJobTitle, 80)} at ${sanitizeForPrompt(leadCompany, 120)}.
Our offer: ${sanitizeForPrompt(yourOffer ?? "our service")}${bookingLink ? `
Booking link you can mention for scheduling: ${bookingLink}` : ""}

${openerDirective}

${COLD_EMAIL_FEWSHOTS}

Rules:
- Maximum 5 sentences
- Sound human and genuine, not salesy
- Reference their specific role and one real detail from the lead facts
- End with a simple question
- No subject line, just the email body
- Sign off exactly as: Best regards,
${senderName || `${sanitizeForPrompt(yourCompany ?? "the team", 120)} team`}
- NEVER use placeholders like [Your Name] or [Company] — use only real details given above${senderSig ? `
- Append this signature block verbatim at the end:\n${senderSig}` : ""}${arabic ? `
- WRITE IN ARABIC with a professional Gulf business tone. Keep company names in Latin script.` : ""}`,
    }], { maxTokens: 800 });

    return json({ content });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
