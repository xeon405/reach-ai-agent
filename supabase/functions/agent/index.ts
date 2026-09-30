// ============================================================================
// AGENT — the chat assistant that actually does things.
//
// The design in one paragraph: a request the router recognises costs no model
// call at all. A request it does not recognise costs exactly ONE model call to
// map it to an intent, and that mapping is cached against the user's own words
// so the identical request is free forever after. Anything that changes data is
// only ever executed after a server-side confirmation, and the step budget caps
// how much a single conversation can do.
//
// The agent deliberately cannot send an email. It prepares work; the user
// launches it from the existing screens, so the reviewed send path stays the
// only way anything reaches a real inbox.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js";
import { getCorsHeaders, jsonCors, corsResponse } from "../_shared/cors.ts";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { insertAudit } from "../_shared/audit.ts";
import { actionCaps, budgetPrompt, requestAction } from "../_shared/action-budget.ts";
import { executeIntent, type AgentOutcome } from "../_shared/agent-executor.ts";
import {
  routeIntent, isWriteIntent, INTENT_DESCRIPTIONS, type AgentIntent, type AgentRequest,
} from "../_shared/agent-router.ts";

function json(body: unknown, status = 200, req?: Request) {
  return jsonCors(body, status, req);
}

const MAX_MESSAGE = 2000;
const VALID_INTENTS = Object.keys(INTENT_DESCRIPTIONS) as AgentIntent[];

/** Canonical form used as the cache key, so punctuation and case never miss. */
function cacheKey(msg: string): string {
  return msg.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function parseRouted(jsonish: string): AgentRequest | null {
  try {
    const m = jsonish.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    const intent = o.intent as AgentIntent;
    if (!VALID_INTENTS.includes(intent)) return null;
    const params = (o.params ?? {}) as AgentRequest["params"];
    const safe: AgentRequest["params"] = {};
    if (typeof params.city === "string") safe.city = params.city.slice(0, 60);
    if (typeof params.company === "string") safe.company = params.company.slice(0, 60);
    if (typeof params.category === "string") safe.category = params.category.slice(0, 60);
    if (typeof params.campaignName === "string") safe.campaignName = params.campaignName.slice(0, 80);
    if (typeof params.query === "string") safe.query = params.query.slice(0, 60);
    if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
      safe.limit = Math.min(Math.max(Math.trunc(params.limit), 1), 200);
    }
    return { intent, params: safe, summary: String(o.summary ?? "").slice(0, 160) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401, req);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: authData, error: authErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !authData.user) return json({ error: "Invalid session" }, 401, req);
    const userId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const message = String(body.message ?? "").slice(0, MAX_MESSAGE).trim();
    if (!message) return json({ error: "Message is empty" }, 400, req);

    const conversationId: string | null = body.conversationId ?? null;
    const confirm = body.confirm === true;
    let usedAi = false;
    let source: "router" | "cache" | "ai" = "router";

    // ---- 1. resolve the intent, cheapest source first -------------------
    let routed: AgentRequest | null = null;

    // A confirmation always refers back to the message that produced it.
    if (confirm && conversationId) {
      const { data: last } = await admin
        .from("agent_messages")
        .select("intent, params, content")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.intent) {
        routed = { intent: last.intent as AgentIntent, params: (last.params ?? {}) as AgentRequest["params"], summary: last.content };
        source = "cache";
      }
    }

    if (!routed) {
      routed = routeIntent(message);
      source = "router";
    }

    // Cache lookup for the exact phrasing the user typed.
    const key = cacheKey(message);
    if (!routed && key) {
      const { data: hit } = await admin
        .from("agent_intent_cache")
        .select("intent, params")
        .eq("user_id", userId)
        .eq("phrase", key)
        .maybeSingle();
      if (hit?.intent && VALID_INTENTS.includes(hit.intent as AgentIntent)) {
        routed = { intent: hit.intent as AgentIntent, params: (hit.params ?? {}) as AgentRequest["params"], summary: message };
        source = "cache";
        await admin.from("agent_intent_cache").update({ hits: (hit as any).hits + 1 }).eq("user_id", userId).eq("phrase", key);
      }
    }

    // ---- 2. one AI call, then never again for this phrasing --------------
    if (!routed) {
      const cap = Number(Deno.env.get("AI_DAILY_CAP") ?? 200);
      const { data: allowed, error: qErr } = await admin.rpc("consume_ai_quota", { uid: userId, cap });
      if (qErr) return json({ error: qErr.message }, 500, req);
      if (!allowed) return json({ error: "Daily AI limit reached. Try again tomorrow." }, 429, req);

      const list = VALID_INTENTS.map((i) => `- ${i}: ${INTENT_DESCRIPTIONS[i]}`).join("\n");
      const out = await groqChat(
        [{
          role: "user",
          content: `Map this request to ONE intent from the list. Reply with JSON only: {"intent":"...","params":{},"summary":"..."}

INTENTS:
${list}

Allowed params: city, company, category, campaignName, query, limit (1-200).

Request: ${sanitizeForPrompt(message, MAX_MESSAGE)}`,
        }],
        { maxTokens: 200, temperature: 0, context: { fn: "agent", kind: "route", user_id: userId } },
      );
      routed = parseRouted(out ?? "");
      usedAi = true;
      source = "ai";

      if (routed && key) {
        // Cache it so this exact phrasing never costs another call.
        await admin.from("agent_intent_cache").upsert(
          { user_id: userId, phrase: key, intent: routed.intent, params: routed.params, hits: 1 },
          { onConflict: "user_id,phrase" },
        );
      }
    }

    if (!routed) {
      return json({
        text: "I did not understand that, and I did not want to guess. Try asking me to find contacts, list your campaigns, or show your numbers.",
        intent: null,
        usedAi,
        source,
      }, 200, req);
    }

    // ---- 3. writes need an explicit, server-checked confirmation --------
    if (isWriteIntent(routed.intent) && !confirm) {
      return json({
        text: `Can I ${routed.summary.toLowerCase()}? Nothing changes until you confirm.`,
        intent: routed.intent,
        pending: { intent: routed.intent, params: routed.params },
        rows: [{ label: "This will change your account", value: "Reply yes to confirm" }],
        usedAi,
        source,
      }, 200, req);
    }

    // ---- 4. step budget, fail-closed ------------------------------------
    const { data: prof } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
    const limits = actionCaps(prof?.plan ?? null);
    const gate = await requestAction(admin as any, {
      conversationId: conversationId ?? "adhoc",
      messageId: key.slice(0, 120) || "msg",
      plan: prof?.plan ?? null,
    });
    if (!gate.allowed) {
      return json({
        text: budgetPrompt(gate),
        intent: routed.intent,
        limitHit: true,
        used: gate.used,
        usedAi,
        source,
      }, 200, req);
    }

    // ---- 5. run it ------------------------------------------------------
    let outcome: AgentOutcome;
    try {
      outcome = await executeIntent(admin as any, userId, routed);
    } catch (err) {
      console.error("agent execute failed", err);
      outcome = { text: "Something went wrong on my side. Nothing was changed." };
    }

    // ---- 6. persist -----------------------------------------------------
    let convId = conversationId;
    if (convId) {
      const { data: owns } = await admin
        .from("agent_conversations").select("id").eq("id", convId).eq("user_id", userId).maybeSingle();
      if (!owns) convId = null;
    }
    if (!convId) {
      const { data: created } = await admin
        .from("agent_conversations")
        .insert({ user_id: userId, title: message.slice(0, 60) })
        .select("id").single();
      convId = created?.id ?? null;
    }
    if (convId) {
      await admin.from("agent_messages").insert([
        { conversation_id: convId, user_id: userId, role: "user", content: message.slice(0, MAX_MESSAGE), intent: routed.intent, params: routed.params, used_ai: usedAi },
        { conversation_id: convId, user_id: userId, role: "assistant", content: outcome.text, intent: routed.intent, params: routed.params, used_ai: usedAi },
      ]);
    }

    if (isWriteIntent(routed.intent)) {
      await insertAudit(admin, {
        user_id: userId,
        event: "agent_write",
        payload: { intent: routed.intent, params: routed.params, source, confirmed: true },
      });
    }

    return json({
      conversationId: convId,
      text: outcome.text,
      rows: outcome.rows,
      empty: outcome.empty,
      intent: routed.intent,
      usedAi,
      source,
      used: gate.used,
      limits,
    }, 200, req);
  } catch (err) {
    console.error("agent failed", err);
    return json({ error: "The assistant could not handle that." }, 500, req);
  }
});
