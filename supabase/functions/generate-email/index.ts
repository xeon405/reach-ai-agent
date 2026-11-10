import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { groqChat, groqKeys, sanitizeForPrompt } from "../_shared/groq.ts";
import { containsArabic, pickOpenerDirective } from "../_shared/ai-lib.ts";
import {
  buildFactWriterPrompt,
  factsFromLead,
  guardDraft,
  listingUrl,
} from "../_shared/fact-writer.ts";

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

    const { leadId, leadName, leadCompany, leadJobTitle, yourCompany, yourOffer } = await req.json();
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

    // Real, verified lead facts so the writer personalises from data instead of
    // inventing it. Scoped to the caller's own leads: leadId is client-supplied,
    // and this client is service-role, so without user_id another tenant's lead
    // would be readable. The id only ever enriches the prompt -- it can never
    // widen what the caller may see, because the name/company/title the email is
    // written from are still the ones the caller supplied.
    let leadRow: Record<string, unknown> = {};
    if (typeof leadId === "string" && leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("category, city, address, country, rating, website, phone, email_status, email_is_role")
        .eq("id", leadId)
        .eq("user_id", userId)
        .maybeSingle();
      leadRow = (lead ?? {}) as Record<string, unknown>;
    }

    const leadCategory = typeof leadRow.category === "string" ? leadRow.category : null;
    const leadCity = typeof leadRow.city === "string" ? leadRow.city : null;

    // The only business input to the writer. Name, company and job title come
    // from the caller; the rest from the lead row. Page-level facts are added
    // later, once the lead has a fetched page.
    const facts = factsFromLead(leadRow, {
      listingUrl: listingUrl(leadName, leadRow.address ?? leadCity),
      extra: [
        { kind: "name", value: leadName, source: "you" },
        { kind: "company", value: leadCompany, source: "you" },
        { kind: "job_title", value: leadJobTitle, source: "you" },
        { kind: "offer", value: yourOffer ?? "our service", source: "you" },
      ],
    });

    const openerDirective = pickOpenerDirective(`${sanitizeForPrompt(leadName, 80)}-${sanitizeForPrompt(leadCompany, 120)}`, {
      hasLeadFacts: Boolean(leadCategory && leadCity),
    });

    const writerPrompt = buildFactWriterPrompt({
      facts,
      senderName: senderName || `${sanitizeForPrompt(yourCompany ?? prof?.company ?? "the team", 120)} team`,
      senderCompany: sanitizeForPrompt(yourCompany ?? prof?.company ?? "our company", 120),
      offer: sanitizeForPrompt(yourOffer ?? "our service", 200),
      bookingLink: bookingLink || undefined,
      signature: senderSig || undefined,
      arabic,
      openerDirective,
    });

    const raw = await groqChat([{ role: "user", content: writerPrompt }], {
      maxTokens: 800,
      json: true,
      context: { fn: "generate-email", kind: "gen_email", user_id: userId },
    });

    // Parse, then enforce. A sentence that cannot point at a verified fact is
    // removed here, and the reason travels back with the draft. Empty content
    // means: do not send this, there is nothing true to say yet.
    const outcome = guardDraft(raw, facts);

    return json({
      content: outcome.content,
      claims: outcome.claims,
      facts: outcome.facts,
      blocked: outcome.blocked,
      empty: outcome.empty,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
