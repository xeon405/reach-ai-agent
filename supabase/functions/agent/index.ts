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
import {
  executeIntent,
  preflightWrite,
  hydrateCampaignName,
  type AgentOutcome,
} from "../_shared/agent-executor.ts";
import {
  loadPendingState,
  savePendingState,
  clearPendingState,
  mergePendingParams,
} from "../_shared/agent-pending.ts";
import {
  loadProfile,
  saveProfileFacts,
  clearProfile,
  hasFacts,
  type Profile,
  type ProfileFacts,
} from "../_shared/agent-profile.ts";
import {
  GOALS,
  isWriteIntent,
  mergeParams,
  missingSlots,
  type AgentIntent,
  type AgentParams,
  type AgentRequest,
} from "../_shared/agent-capabilities.ts";
import {
  understand,
  answerFromContext,
  repeatCount,
  trimTruncatedReply,
  type HistoryTurn,
  MAX_HISTORY,
} from "../_shared/agent-understand.ts";
import { loadAgentAccountContext } from "../_shared/agent-account-context.ts";
import { degradedReply } from "../_shared/business-context.ts";
import {
  ACCOUNT_SCOPE,
  describeLearned,
  forget,
  isLearnable,
  listLearned,
  phraseKey,
  recall,
  recordUse,
  retireLastUsed,
  type LearnedRow,
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
  return (
    [
      "yes",
      "yeah",
      "yep",
      "yup",
      "ok",
      "okay",
      "sure",
      "do it",
      "go ahead",
      "confirm",
      "please do",
      "y",
    ].includes(m) ||
    m.startsWith("yes ") ||
    m.startsWith("ok ")
  );
}

/**
 * A conversation id proven to belong to this user, creating one if needed. A
 * caller-supplied id belonging to someone else is rejected, not trusted, so a
 * forged conversationId cannot reach another tenant's history or vocabulary.
 */
async function ensureConversation(
  admin: Admin,
  userId: string,
  conversationId: string | null,
): Promise<string> {
  if (conversationId) {
    const { data: owns } = await admin
      .from("agent_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (owns) return owns.id as string;
  }
  const { data: created } = await admin
    .from("agent_conversations")
    .insert({ user_id: userId, title: "New chat" })
    .select("id")
    .single();
  return created?.id as string;
}

async function loadHistory(
  admin: Admin,
  userId: string,
  conversationId: string,
): Promise<HistoryTurn[]> {
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
    {
      conversation_id: convId,
      user_id: userId,
      role: "assistant",
      content: assistantText,
      intent,
      params,
      used_ai: usedAi,
    },
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

    // ---- reopen a past conversation -------------------------------------
    // The messages were always saved; the UI just could not read them back.
    // This returns the thread so a refresh does not look like data loss.
    if (body.action === "history") {
      const id = String(body.conversationId ?? "");
      if (!id) return json({ error: "conversationId is required" }, 400, req);
      // Scoped by user_id so one account can never read another's thread.
      const { data: convo } = await admin
        .from("agent_conversations")
        .select("id, title, created_at")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!convo) return json({ error: "Conversation not found" }, 404, req);
      const { data: msgs } = await admin
        .from("agent_messages")
        .select("id, role, content, intent, params, used_ai, created_at, executed_at")
        .eq("conversation_id", id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(500);
      return json(
        {
          conversationId: id,
          title: convo.title,
          messages: (msgs ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            usedAi: m.used_ai ?? false,
            intent: m.intent ?? null,
          })),
        },
        200,
        req,
      );
    }

    // ---- list this user's conversations, newest first --------------------
    if (body.action === "conversations") {
      const { data } = await admin
        .from("agent_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ conversations: data ?? [] }, 200, req);
    }

    // ---- delete a conversation -------------------------------------------
    // Explicit user action only. Nothing is ever removed automatically, so
    // storage is bounded by what the user chooses to keep.
    if (body.action === "conversation_delete") {
      const id = String(body.conversationId ?? "");
      if (!id) return json({ error: "conversationId is required" }, 400, req);
      // Messages first: they are children of the conversation.
      await admin.from("agent_messages").delete().eq("conversation_id", id).eq("user_id", userId);
      const { error } = await admin
        .from("agent_conversations")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500, req);
      // Provisional phrases learned only in that chat are now meaningless.
      await admin.from("agent_learned_phrases").delete().eq("user_id", userId).eq("scope", id);
      return json({ ok: true }, 200, req);
    }

    // ---- what the agent has learned, so the user can see and edit it ----
    if (body.action === "learned_list") {
      return json({ learned: describeLearned(await listLearned(admin, userId)) }, 200, req);
    }
    if (body.action === "learned_forget") {
      await forget(admin, userId, Number(body.id));
      return json({ ok: true }, 200, req);
    }

    // ---- what the agent remembers about their business ------------------
    // Stored memory the user can read and wipe. Keeping it invisible would
    // just be a more polite version of the problem we are fixing.
    if (body.action === "profile") {
      return json({ profile: publicProfile(await loadProfile(admin, userId)) }, 200, req);
    }
    if (body.action === "profile_forget") {
      await clearProfile(admin, userId);
      return json({ ok: true }, 200, req);
    }

    const message = String(body.message ?? "")
      .slice(0, MAX_MESSAGE)
      .trim();
    if (!message) return json({ error: "Message is empty" }, 400, req);
    const confirm = body.confirm === true;
    // The UI sends this when the person clicked a MENU BUTTON instead of
    // typing. A click is an unambiguous, machine-chosen intent, so it must
    // never be read by the model: same answer, zero AI calls, zero quota.
    const viaMenu = body.viaMenu === true;
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
          await admin
            .from("agent_messages")
            .update({ executed_at: new Date().toISOString() })
            .eq("id", last.id as string)
            .eq("user_id", userId);
        }
        const reply = "Understood — I did not change anything.";
        await persist(admin, userId, convId, message, reply, null, {}, false, {
          storeUserIntent: false,
          spent: true,
        });
        return json(
          {
            conversationId: convId,
            text: reply,
            intent: null,
            declined: true,
            usedAi: false,
            source: "confirm",
          },
          200,
          req,
        );
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
        const reply =
          "There is nothing waiting for your confirmation. Ask me to change something and I will check with you first.";
        await persist(admin, userId, convId, message, reply, null, {}, false, {
          storeUserIntent: false,
          spent: true,
        });
        return json(
          { conversationId: convId, text: reply, intent: null, usedAi: false, source: "confirm" },
          200,
          req,
        );
      }

      const req_: AgentRequest = {
        intent: pending.intent as AgentIntent,
        params: (pending.params ?? {}) as AgentParams,
        summary: pending.content ?? "",
      };

      const { data: prof } = await admin
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();
      const gate = await requestAction(admin, {
        conversationId: convId,
        messageId: `${convId}:${nid()}`,
        plan: prof?.plan ?? null,
      });
      if (!gate.allowed) {
        const reply = budgetPrompt(gate);
        await persist(admin, userId, convId, message, reply, null, {}, false, {
          storeUserIntent: false,
          spent: true,
        });
        return json(
          {
            conversationId: convId,
            text: reply,
            intent: req_.intent,
            limitHit: true,
            usedAi: false,
            source: "confirm",
          },
          200,
          req,
        );
      }

      const outcome = await runOutcome(admin, userId, req_);
      await admin
        .from("agent_messages")
        .update({ executed_at: new Date().toISOString() })
        .eq("id", pending.id as string)
        .eq("user_id", userId);
      await persist(admin, userId, convId, message, outcome.text, req_.intent, req_.params, false, {
        storeUserIntent: false,
      });
      await insertAudit(admin, {
        user_id: userId,
        event: "agent_write",
        payload: { intent: req_.intent, params: req_.params, source: "confirm" },
      });
      return json(
        {
          conversationId: convId,
          text: outcome.text,
          rows: outcome.rows,
          empty: outcome.empty,
          intent: req_.intent,
          usedAi: false,
          source: "confirm",
        },
        200,
        req,
      );
    }

    // =====================================================================
    // CHAT PATH — fast lane first, understanding second.
    // =====================================================================
    const key = phraseKey(message);
    const learned: LearnedRow | null = await recall(admin, userId, key, convId);
    const history = await loadHistory(admin, userId, convId);

    // What were we in the middle of? If the last turn ended in a question,
    // this message is probably the ANSWER, not a new request. Carrying the
    // intent + partial params forward is what makes follow-ups work at all.
    const carried = await loadPendingState(admin, userId, convId);
    let profile: Profile | null = await loadProfile(admin, userId);
    // Owner + account facts, read fresh each turn so the agent never has to
    // guess something Settings/Profiles already knows. Runs in parallel with the
    // other per-turn reads and degrades to empty rather than failing the turn.
    const accountCtx = await loadAgentAccountContext(admin, userId);

    let usedAi = false;
    let source: "learned" | "ai" | "router" | "menu" = "learned";
    let routed: AgentRequest | null = null;
    let replyText: string | null = null;
    let askOnly: { question: string; intent: AgentIntent | null; params?: AgentParams } | null =
      null;
    let profileReply: string | null = null;
    let profileFacts: ProfileFacts = {};
    let cacheIntent: AgentIntent | null = null;
    let u: Awaited<ReturnType<typeof understand>> = null;
    let cacheParams: AgentParams = {};

    // MENU FAST PATH — a button click is an unambiguous, machine-chosen
    // intent. routeIntent() is pure keyword matching with no I/O, so it
    // answers here with zero AI calls and zero quota. It runs BEFORE the
    // learned-phrase lane because an explicit click beats a phrase we
    // guessed from an earlier turn. If the router does not recognise it we
    // fall through to the normal path instead of dead-ending.
    const menuHit = viaMenu ? routeIntent(message) : null;
    if (menuHit) {
      routed = menuHit;
      source = "menu";
    } else if (learned) {
      routed = { intent: learned.intent, params: learned.params, summary: message };
      source = "learned";
    } else {
      const cap = Number(Deno.env.get("AI_DAILY_CAP") ?? 200);
      const { data: allowed, error: qErr } = await admin.rpc("consume_ai_quota", {
        uid: userId,
        cap,
      });
      if (qErr) return json({ error: qErr.message }, 500, req);
      if (!allowed) {
        const fallback = routeIntent(message);
        if (!fallback) {
          return json({ error: "Daily AI limit reached. Try again tomorrow." }, 429, req);
        }
        routed = fallback;
        source = "router";
      } else {
        u = await understand(message, history, userId, carried, profile, accountCtx);
        if (!u || !u.u) {
          // Model unusable. The keyword router is the safety net so the turn
          // still does something sensible instead of failing.
          const fallback = routeIntent(message);
          if (fallback) {
            routed = fallback;
            source = "router";
          } else {
            // Nothing usable came back. Before falling back to a dead end,
            // try to answer from the account/business context - "what do you
            // know about my business" is precisely a question that context can
            // answer, and it used to return "I could not work that out".
            const contextual = await answerFromContext(message, history, userId, accountCtx);
            if (contextual) {
              usedAi = true;
              source = "ai";
              replyText = trimTruncatedReply(contextual);
            } else {
              // Never dead-end. "I could not work that out just now" was both a
              // lie by omission (we DO hold their account) and the single
              // worst thing to say when someone asks a real question. Answer
              // from the snapshot instead, and admit the model is down rather
              // than pretending we understood them.
              const reply = degradedReply(accountCtx?.facts);
              await persist(admin, userId, convId, message, reply, null, {}, false);
              // "router", not "ai": the model did NOT answer this turn. Reporting
              // "ai" here hid a total provider outage behind a normal-looking
              // success, which is how a broken AI lane looks like flaky prompts.
              return json(
                {
                  conversationId: convId,
                  text: reply,
                  intent: null,
                  source: "router",
                  usedAi: false,
                },
                200,
                req,
              );
            }
          }
        } else {
          usedAi = true;
          source = "ai";
          cacheIntent = u.cachedIntent;
          cacheParams = u.cachedParams;
          if (u.u.kind === "chat") {
            replyText = u.u.reply;
            // A bot that says the same sentence four times looks broken even
            // when every individual reply is "correct". If this repeats what
            // we already said, force a fresh, more specific answer instead.
            if (repeatCount(replyText, history) >= 1) {
              const fresh = await answerFromContext(
                `${message}\n\n(Your last reply repeated an earlier answer. Answer differently and more specifically this time.)`,
                history,
                userId,
                accountCtx,
              );
              if (fresh) replyText = fresh;
            }
            // Final safety net: reasoning tokens share the max_tokens budget, so
            // a detailed answer can still come back severed mid-word. Never ship
            // half a word to the person.
            replyText = trimTruncatedReply(replyText);
          } else if (u.u.kind === "profile") {
            // They told us something about their business. Remember it, then
            // answer normally. This is the turn that used to be swallowed and
            // answered with "what would you like to name the campaign?".
            profileReply = u.u.reply;
            profileFacts = u.u.facts;
          } else if (u.u.kind === "ask") {
            // cachedParams, not u.u.params: it is already the merge of what the
            // model said this turn and what we were holding from last turn.
            askOnly = { question: u.u.question, intent: u.u.intent, params: u.cachedParams };
          } else if (u.u.kind === "unclear") {
            askOnly = { question: u.u.question, intent: null };
          } else {
            routed = u.u.req;
          }
        }
      }
    }

    // They shared something about themselves. Persist it so the next visit, and
    // the next suggestion, can actually use it - then clear any stale
    // clarification, because this turn answered everything, not a slot.
    // The profile branch ships user-visible text too, and it was the path still
    // emitting severed replies ("...Vancouver, Sydney, Me") after the chat path
    // had been guarded.
    if (profileReply !== null) profileReply = trimTruncatedReply(profileReply);

    if (profileReply !== null) {
      if (hasFacts(profileFacts)) {
        profile = await saveProfileFacts(admin, userId, profileFacts);
      }
      await clearPendingState(admin, userId, convId);
      await persist(admin, userId, convId, message, profileReply, null, {}, usedAi);
      return json(
        {
          conversationId: convId,
          text: profileReply,
          intent: null,
          remembered: hasFacts(profileFacts),
          profile: publicProfile(profile),
          usedAi,
          source,
        },
        200,
        req,
      );
    }

    // Pure conversation: no data touched, nothing to execute.
    if (replyText !== null) {
      await persist(admin, userId, convId, message, replyText, null, {}, usedAi);
      return json(
        { conversationId: convId, text: replyText, intent: null, usedAi, source },
        200,
        req,
      );
    }

    // Missing a required slot, or genuinely ambiguous: ask, do not guess.
    if (askOnly) {
      // REMEMBER what we were heading for. Without this the person's answer
      // to our own question looks like an unrelated new message.
      //
      // mergePendingParams (not savePendingState) because a SECOND question
      // must not erase what the first one already collected.
      await mergePendingParams(admin, userId, convId, askOnly.params ?? {}, askOnly.intent);
      const safeQuestion = trimTruncatedReply(askOnly.question);
      await persist(admin, userId, convId, message, safeQuestion, null, {}, usedAi);
      return json(
        { conversationId: convId, text: safeQuestion, intent: null, asked: true, usedAi, source },
        200,
        req,
      );
    }

    if (!routed) {
      const reply = "I did not catch that. Could you say it another way?";
      await persist(admin, userId, convId, message, reply, null, {}, usedAi);
      return json({ conversationId: convId, text: reply, intent: null, usedAi, source }, 200, req);
    }

    // A reply that COMPLETES our own question belongs to the goal we asked
    // about, not to whatever new intent the model reads into it.
    //
    // Without this, "add my London dentists to a campaign" -> we ask "which
    // campaign?" -> they answer "Spring Sale", and the model would start a
    // brand new "create campaign draft" instead of finishing the original
    // request. The pending row already told us the goal, so honour it whenever
    // the answer genuinely satisfies the slot we were missing.
    if (carried?.intent && routed && routed.intent !== carried.intent) {
      const carriedGoal = GOALS.find((g) => g.intent === carried.intent);
      const merged = mergeParams(carried.params ?? {}, routed.params);
      const gaps = carriedGoal ? missingSlots(carriedGoal, merged) : [];
      if (carriedGoal && gaps.length === 0) {
        routed = { intent: carried.intent, params: merged, summary: carriedGoal.goal };
      }
    }

    // Name the campaign from the user's own rows if the model did not. Doing it
    // here, ahead of preflight, means "pause Q3 push" reaches the resolver as an
    // exact target instead of looking like a nameless request.
    routed = {
      ...routed,
      params: await hydrateCampaignName(admin, userId, routed.intent, routed.params, message),
    };

    // Resolve the target BEFORE asking anyone to confirm anything.
    //
    // Confirmation used to come first, which meant "pause Q3" would ask "Can I
    // pause Q3?" and only then discover that two campaigns match. The user
    // confirmed a write that could not run. Cheaper to ask the question that
    // actually decides the outcome.
    if (isWriteIntent(routed.intent)) {
      const pre = await preflightWrite(admin, userId, routed);

      if (pre?.need) {
        await savePendingState(admin, userId, convId, pre.need.intent, pre.need.params);
        await persist(admin, userId, convId, message, pre.text, null, {}, usedAi);
        return json(
          {
            conversationId: convId,
            text: pre.text,
            intent: null,
            asked: true,
            rows: pre.rows,
            usedAi,
            source,
          },
          200,
          req,
        );
      }

      if (pre?.choose) {
        await savePendingState(admin, userId, convId, pre.choose.intent, pre.choose.params);
        await persist(admin, userId, convId, message, pre.text, null, {}, usedAi);
        return json(
          {
            conversationId: convId,
            text: pre.text,
            intent: null,
            asked: true,
            // Tappable names, not a list telling them to type the name back.
            options: pre.choose.candidates.map((name) => ({ label: name, message: name })),
            usedAi,
            source,
          },
          200,
          req,
        );
      }

      if (pre?.empty) {
        // Nothing left to clarify: the turn is over, so do not leave the goal
        // parked for the next message to inherit.
        await clearPendingState(admin, userId, convId);
        await persist(admin, userId, convId, message, pre.text, null, {}, usedAi);
        return json(
          {
            conversationId: convId,
            text: pre.text,
            intent: null,
            empty: true,
            rows: [],
            options: pre.options,
            usedAi,
            source,
          },
          200,
          req,
        );
      }

      // Unambiguous: now it is safe to ask.
      //
      // Clear the clarification first. A write supersedes it: leaving the old
      // goal parked would let a later, unrelated message inherit it.
      await clearPendingState(admin, userId, convId);
      const ask = `Can I ${routed.summary.toLowerCase()}? Nothing changes until you confirm.`;
      await persist(admin, userId, convId, message, ask, routed.intent, routed.params, usedAi);
      return json(
        {
          conversationId: convId,
          text: ask,
          intent: routed.intent,
          pending: { intent: routed.intent, params: routed.params },
          rows: [{ label: "This will change your account", value: "Reply yes to confirm" }],
          usedAi,
          source,
        },
        200,
        req,
      );
    }

    // The request completed (or was abandoned), so the clarification is spent.
    // A stale entry here is what would make an unrelated message two turns
    // later silently inherit a campaign name nobody mentioned.
    await clearPendingState(admin, userId, convId);

    // A read. Not charged against the step budget: the budget caps steps INSIDE
    // one turn, and a chat turn runs exactly one allowlisted query.
    const outcome = await runOutcome(admin, userId, routed);
    // Executor text is user-visible too, and it can be severed by the same
    // shared max_tokens budget. Trim once, here, so no path can ship half a word.
    outcome.text = trimTruncatedReply(outcome.text);

    // A read can still be missing a slot the PROMPT thought it had. Re-ask and
    // remember, rather than reporting a misleading empty result.
    if (outcome.need) {
      await savePendingState(admin, userId, convId, outcome.need.intent, outcome.need.params);
      await persist(admin, userId, convId, message, outcome.text, null, {}, usedAi);
      return json(
        {
          conversationId: convId,
          text: outcome.text,
          intent: null,
          asked: true,
          rows: outcome.rows,
          usedAi,
          source,
        },
        200,
        req,
      );
    }

    // Two campaigns share a name: refuse to guess and offer the real options.
    // On a write this is the difference between pausing the right thing and
    // pausing the wrong one.
    if (outcome.choose) {
      await savePendingState(admin, userId, convId, outcome.choose.intent, outcome.choose.params);
      await persist(admin, userId, convId, message, outcome.text, null, {}, usedAi);
      return json(
        {
          conversationId: convId,
          text: outcome.text,
          intent: null,
          asked: true,
          options: outcome.choose.candidates.map((name) => ({ label: name, message: name })),
          usedAi,
          source,
        },
        200,
        req,
      );
    }

    // Confusion is the retirement signal, NOT an empty result. A brand-new
    // account answers every correct request with "you have nothing yet", so
    // retiring on empty would discard exactly the phrases a new user is still
    // building up. If the model could not follow the follow-up, the previous
    // fast-lane answer is the likely culprit.
    if (!learned && u?.u?.kind === "unclear") {
      await retireLastUsed(admin, userId, convId);
    }

    // Learn only from the model, and only when the phrase is a real instruction
    // rather than a greeting or a bare "yes".
    if (!learned && cacheIntent && isLearnable(key) && routed.intent === cacheIntent) {
      await recordUse(admin, userId, key, cacheIntent, cacheParams, convId, null);
    } else if (learned) {
      await recordUse(
        admin,
        userId,
        learned.phrase,
        learned.intent,
        learned.params,
        convId,
        learned,
      );
    }

    // A read can repeat itself too. The guard used to sit only on the chat path,
    // so a deterministic executor line came back four times in a row untouched.
    //
    // Two exclusions, both deliberate:
    // - the learned fast lane REPEATS on purpose; serving a cached phrase again is
    //   the whole point, and re-asking the model would spend an AI call to say the
    //   same thing
    // - a write confirmation is not ours to rewrite; it must match what the person
    //   is confirming
    const isWriteGoal = GOALS.find((g) => g.intent === routed.intent)?.write === true;
    if (!learned && !isWriteGoal && repeatCount(outcome.text, history) >= 1) {
      const fresh = await answerFromContext(message, history, userId, accountCtx);
      if (fresh) {
        outcome.text = fresh;
        usedAi = true;
        source = "ai";
      }
    }

    await persist(
      admin,
      userId,
      convId,
      message,
      outcome.text,
      routed.intent,
      routed.params,
      usedAi,
    );
    return json(
      {
        conversationId: convId,
        text: outcome.text,
        rows: outcome.rows,
        empty: outcome.empty,
        options: outcome.options,
        intent: routed.intent,
        usedAi,
        source,
      },
      200,
      req,
    );
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

/** Only the human-meaningful fields; updated_at is never worth sending back. */
function publicProfile(p: Profile | null): ProfileFacts | null {
  if (!p) return null;
  const { business_name, website, product, audience, goals, notes } = p;
  return { business_name, website, product, audience, goals, notes };
}
