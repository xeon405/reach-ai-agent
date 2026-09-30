// ============================================================================
// AGENT — a chatbot that understands you, and gets more fluent the more we talk.
//
// Two lanes, and the whole design is about which one runs:
//
//   FAST  learned vocabulary. Zero model calls. After the first time, a repeat
//         of your own wording is instant and free.
//   SLOW  the model, reading MEANING rather than words. Runs whenever the fast
//         lane misses. Also allowed to simply answer, with no goal at all, which
//         is what makes this a chatbot instead of a command parser.
//
// Learning is per-account, promoted from one chat to the whole account only
// after the same wording is used in a second, different conversation. A
// mistake is retired the moment it produces nothing, and the words are handed
// back to the slow lane.
//
// Everything that CHANGES something still stops and asks. The model may be
// creative about understanding; it is never trusted with your data or your
// real numbers, and a write cannot reach the database without a server-checked
// yes. The agent cannot send email at all - it prepares, you launch.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js";
import { getCorsHeaders, jsonCors, corsResponse } from "../_shared/cors.ts";
import { insertAudit } from "../_shared/audit.ts";
import { actionCaps, budgetPrompt, requestAction } from "../_shared/action-budget.ts";
import { executeIntent, type AgentOutcome } from "../_shared/agent-executor.ts";
import {
  GOALS, isWriteIntent, type AgentIntent, type AgentParams, type AgentRequest,
} from "../_shared/agent-capabilities.ts";
import { understand, type HistoryTurn, MAX_HISTORY } from "../_shared/agent-understand.ts";
import {
  ACCOUNT_SCOPE, describeLearned, forget, isLearnable, listLearned, phraseKey,
  recall, recordUse, retire, type LearnedRow,
} from "../_shared/agent-learning.ts";
// The keyword router is no longer the gatekeeper. It is the SAFETY NET for when
// the model is unavailable, rate-limited, or returns something unusable.
import { routeIntent } from "../_shared/agent-router.ts";

function json(body: unknown, status = 200, req?: Request) {
  return jsonCors(body, status, req);
}

const MAX_MESSAGE = 2000;
let seq = 0;
const nid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Admin = { from: (table: string) => any };

/** Only an explicit agreement counts. Anything else is a decline. */
function isAffirmative(msg: string): boolean {
  const m = phraseKey(msg);
  return ["yes", "yeah", "yep", "yup", "ok", "okay", "sure", "do it", "go ahead", "confirm", "please do", "y"]
    .includes(m);
}

/**
 * A conversation id proven to belong to this user, creating one if needed. A
 * caller-supplied id belonging to someone else is rejected, not trusted, so a
 * forged conversationId cannot reach another tenant's history or vocabulary.
 */
async function ensureConversation(admin: Admin, userId: string, conversationId: string | null): Promise<string> {
  if (conversationId) {
    const { data: owns } = await admin
      .from("agent_conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (owns) return owns.id as string;
  }
  const { data: created } = await admin
    .from("agent_conversations")
    .insert({ user_id: userId, title: "New chat" })
    .select("id").single();
  return created?.id as string;
}

async function loadHistory(admin: Admin, userId: string, conversationId: string): Promise<HistoryTurn[]> {
  const { data } = await admin
    .from("agent_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);
  return ((data ?? []) as HistoryTurn[]).reverse();
}

async function persist(
  admin: Admin,
  userId: string,
  convId: string,
  userText: string,
  assistantText: string,
  intent: AgentIntent | null,
  params: AgentParams,
  usedAi: boolean,
  opts: { spent?: boolean; storeUserIntent?: boolean } = {},
): Promise<void> {
  await admin.from("agent_messages").insert([
    {
      conversation_id: convId,
      user_id: userId,
      role: "user",
      content: userText.slice(0, MAX_MESSAGE),
      // A "yes" is transport, not a new request. Logging it with the intent
      // would leave an unspent pending intent that a replay could re-run.
      intent: opts.storeUserIntent === false ? null : intent,
      params: opts.storeUserIntent === false ? {} : params,
      used_ai: usedAi,
      executed_at: opts.spent ? new Date().toISOString() : null,
    },
    { conversation_id: convId, user_id: userId, role: "assistant", content: assistantText, intent, params, used_ai: usedAi },
  ]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing authorization" }, 401, req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return json({ error: "Not authorised" }, 401, req);
    const userId = authData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));

    // ---- what the agent has learned, so the user can see and edit it ----
    if (body.action === "learned_list") {
      return json({ learned: describeLearned(await listLearned(admin, userId)) }, 200, req);
    }
    if (body.action === "learned_forget") {
      await forget(admin, userId, Number(body.id));
      return json({ ok: true }, 200, req);
    }

    const message = String(body.message ?? "").slice(0, MAX_MESSAGE).trim();
    if (!message) return json({ error: "Message is empty" }, 400, req);
    const confirm = body.confirm === true;
    const convId = await ensureConversation(admin, userId, body.conversationId ?? null);

    // =====================================================================
    // CONFIRM PATH — never touches the model.
    // It re-reads the stored intent, so a forged "yes" cannot invent an action,
    // and the message is spent afterwards so it cannot be replayed.
    // =====================================================================
    if (confirm) {
      if (!isAffirmative(message)) {
        const { data: last } = await admin
          .from("agent_messages")
          .select("id, intent")
          .eq("conversation_id", convId)
          .eq("user_id", userId)
          .eq("role", "user")
          .is("executed_at", null)
          .not("intent", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.id) {
          await admin.from("agent_messages").update({ executed_at: new Date().toISOString() })
            .eq("id", last.id as string).eq("user_id", userId);
        }
        const reply = "Understood — I did not change anything.";
        await persist(admin, userId, convId, message, reply, null, {}, false, { storeUserIntent: false, spent: true });
        return json({ conversationId: convId, text: reply, intent: null, declined: true, source: "confirm" }, 200, req);
      }

      const { data: pending } = await admin
        .from("agent_messages")
        .select("id, intent, params, content")
        .eq("conversation_id", convId)
        .eq("user_id", userId)
        .eq("role", "user")
        .is("executed_at", null)
        .not("intent", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pending?.intent || !isWriteIntent(pending.intent as AgentIntent)) {
        const reply = "There is nothing waiting for your confirmation. Ask me to change something and I will check with you first.";
        await persist(admin, userId, convId, message, reply, null, {}, false, { storeUserIntent: false, spent: true });
        return json({ conversationId: convId, text: reply, intent: null, source: "confirm" }, 200, req);
      }

      const req_: AgentRequest = {
        intent: pending.intent as AgentIntent,
        params: (pending.params ?? {}) as AgentParams,
        summary: pending.content ?? "",
      };

      const { data: prof } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
      const gate = await requestAction(admin, {
        conversationId: convId,
        messageId: `${convId}:${nid()}`,
        plan: prof?.plan ?? null,
      });
      if (!gate.allowed) {
        const reply = budgetPrompt(gate);
        await persist(admin, userId, convId, message, reply, null, {}, false, { storeUserIntent: false, spent: true });
        return json({ conversationId: convId, text: reply, intent: req_.intent, limitHit: true, source: "confirm" }, 200, req);
      }

      const outcome = await runOutcome(admin, userId, req_);
      await admin.from("agent_messages").update({ executed_at: new Date().toISOString() })
        .eq("id", pending.id as string).eq("user_id", userId);
      await persist(admin, userId, convId, message, outcome.text, req_.intent, req_.params, false, { storeUserIntent: false });
      await insertAudit(admin, {
        user_id: userId,
        event: "agent_write",
        payload: { intent: req_.intent, params: req_.params, source: "confirm" },
      });
      return json({ conversationId: convId, text: outcome.text, rows: outcome.rows, empty: outcome.empty, intent: req_.intent, source: "confirm" }, 200, req);
    }

    // =====================================================================
    // CHAT PATH — fast lane first, understanding second.
    // =====================================================================
    const key = phraseKey(message);
    const learned: LearnedRow | null = await recall(admin, userId, key, convId);
    const history = await loadHistory(admin, userId, convId);

    let usedAi = false;
    let source: "learned" | "ai" | "router" = "learned";
    let routed: AgentRequest | null = null;
    let replyText: string | null = null;
    let askOnly: { question: string; intent: AgentIntent | null } | null = null;
    let cacheIntent: AgentIntent | null = null;
    let cacheParams: AgentParams = {};

    if (learned) {
      routed = { intent: learned.intent, params: learned.params, summary: message };
      source = "learned";
    } else {
      const cap = Number(Deno.env.get("AI_DAILY_CAP") ?? 200);
      const { data: allowed, error: qErr } = await admin.rpc("consume_ai_quota", { uid: userId, cap });
      if (qErr) return json({ error: qErr.message }, 500, req);
      if (!allowed) {
        const fallback = routeIntent(message);
        if (!fallback) {
          return json({ error: "Daily AI limit reached. Try again tomorrow." }, 429, req);
        }
        routed = fallback;
        source = "router";
      } else {
        const u = await understand(message, history, userId);
        if (!u || !u.u) {
          // Model unusable. The keyword router is the safety net so the turn
          // still does something sensible instead of failing.
          const fallback = routeIntent(message);
          if (fallback) {
            routed = fallback;
            source = "router";
          } else {
            const reply = "I could not work that out just now. Try asking me to find contacts, list your campaigns, or show your numbers.";
            await persist(admin, userId, convId, message, reply, null, {}, false);
            return json({ conversationId: convId, text: reply, intent: null, source: "ai" }, 200, req);
          }
        } else {
          usedAi = true;
          source = "ai";
          cacheIntent = u.cachedIntent;
          cacheParams = u.cachedParams;
          if (u.u.kind === "chat") {
            replyText = u.u.reply;
          } else if (u.u.kind === "ask") {
            askOnly = { question: u.u.question, intent: u.u.intent };
          } else if (u.u.kind === "unclear") {
            askOnly = { question: u.u.question, intent: null };
          } else {
            routed = u.u.req;
          }
        }
      }
    }

    // Pure conversation: no data touched, nothing to execute.
    if (replyText !== null) {
      await persist(admin, userId, convId, message, replyText, null, {}, usedAi);
      return json({ conversationId: convId, text: replyText, intent: null, usedAi, source }, 200, req);
    }

    // Missing a required slot, or genuinely ambiguous: ask, do not guess.
    if (askOnly) {
      await persist(admin, userId, convId, message, askOnly.question, null, {}, usedAi);
      return json({ conversationId: convId, text: askOnly.question, intent: null, asked: true, usedAi, source }, 200, req);
    }

    if (!routed) {
      const reply = "I did not catch that. Could you say it another way?";
      await persist(admin, userId, convId, message, reply, null, {}, usedAi);
      return json({ conversationId: convId, text: reply, intent: null, usedAi, source }, 200, req);
    }

    // A write always stops here and asks, even when the fast lane recognised it.
    if (isWriteIntent(routed.intent)) {
      await persist(admin, userId, convId, message, `Can I ${routed.summary.toLowerCase()}? Nothing changes until you confirm.`, routed.intent, routed.params, usedAi);
      return json({
        conversationId: convId,
        text: `Can I ${routed.summary.toLowerCase()}? Nothing changes until you confirm.`,
        intent: routed.intent,
        pending: { intent: routed.intent, params: routed.params },
        rows: [{ label: "This will change your account", value: "Reply yes to confirm" }],
        usedAi,
        source,
      }, 200, req);
    }

    // A read. Not charged against the step budget: the budget caps steps INSIDE
    // one turn, and a chat turn runs exactly one allowlisted query.
    const outcome = await runOutcome(admin, userId, routed);

    // A fast-lane hit that found nothing is a mislearned phrase. Retire it so
    // the words go back to the slow lane next time.
    if (learned && outcome.empty) {
      await retire(admin, userId, learned.phrase, learned.scope === ACCOUNT_SCOPE ? null : learned.scope);
    }
    // Learn only from the model, and only when the phrase is a real instruction
    // rather than a greeting or a bare "yes".
    if (!learned && cacheIntent && isLearnable(key) && routed.intent === cacheIntent) {
      await recordUse(admin, userId, key, cacheIntent, cacheParams, convId, null);
    } else if (learned) {
      await recordUse(admin, userId, learned.phrase, learned.intent, learned.params, convId, learned);
    }

    await persist(admin, userId, convId, message, outcome.text, routed.intent, routed.params, usedAi);
    return json({
      conversationId: convId,
      text: outcome.text,
      rows: outcome.rows,
      empty: outcome.empty,
      intent: routed.intent,
      usedAi,
      source,
    }, 200, req);
  } catch (err) {
    console.error("agent failed", err);
    return json({ error: "The assistant could not handle that." }, 500, req);
  }
});

/** Runs one allowlisted goal. A thrown error must never look like a change. */
async function runOutcome(admin: Admin, userId: string, r: AgentRequest): Promise<AgentOutcome> {
  try {
    return await executeIntent(admin, userId, r);
  } catch (err) {
    console.error("agent execute failed", err);
    return { text: "Something went wrong on my side. Nothing was changed." };
  }
}
