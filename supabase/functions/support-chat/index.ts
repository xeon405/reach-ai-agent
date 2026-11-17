import { createClient } from "npm:@supabase/supabase-js";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { buildSupportUserContext, containsArabic, routeSupportTopic, supportTopicHits, isPersonalContactRequest, personalContactAnswer, SUPPORT_SELF_FACTS, SUPPORT_CONTROLS, SUPPORT_FEWSHOTS } from "../_shared/ai-lib.ts";
import { buildSupportManual } from "../_shared/support-manual.ts";
import { ensureBillingFacts } from "../_shared/support-topics.ts";
import { fastSupportAnswer, fastTopicForReply } from "../_shared/support-fast.ts";
import { getCorsHeaders, jsonCors, corsResponse } from "../_shared/cors.ts";
import { openAiCall, openGuestAiCall } from "../_shared/ai-cost-gate.ts";

function json(body: unknown, status = 200, req?: Request) {
  return jsonCors(body, status, req);
}

/**
 * The product's previous payment processor is never shown to users. Prompt
 * instructions alone are not enough: the model will happily echo the name back
 * when a customer types it into the chat ("that was LemonSqueezy"). This is a
 * hard output guard so the name cannot reach the browser, however the model
 * decides to phrase its answer.
 */
function redactLegacyProcessor(text: string): string {
  return text.replace(/\blemonsqueezy\b/gi, "our previous payment provider");
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  try {
    const authHeader = req.headers.get("Authorization");
    const guestId = String(req.headers.get("x-guest-id") ?? "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Either a signed-in user (Bearer token) or a visitor identifier
    // (x-guest-id: a UUID the browser generates once and reuses).
    let userId: string | null = null;
    let isGuest = false;
    if (authHeader) {
      const { data: authData, error: authErr } = await admin.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authErr || !authData.user) return json({ error: "Invalid session" }, 401);
      userId = authData.user.id;
    } else if (guestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guestId)) {
      isGuest = true;
    } else {
      return json({ error: "Not authenticated" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const givenThread = String(body?.thread_id ?? "").trim();

    // ── Thread resolution: given id → latest open thread for user/guest → new thread ──
    let threadId = givenThread;
    if (threadId) {
      const ownerFilter = isGuest
        ? { guest_id: guestId }
        : { user_id: userId! };
      const { data: thr } = await admin
        .from("support_chat_threads").select("id").eq("id", threadId)
        .match(ownerFilter).maybeSingle();
      if (!thr) threadId = "";
    }
    if (!threadId) {
      const ownerFilter = isGuest
        ? { guest_id: guestId }
        : { user_id: userId! };
      const { data: latest } = await admin
        .from("support_chat_threads").select("id").eq("status", "auto")
        .match(ownerFilter)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      threadId = latest?.id ?? "";
    }

    // ── 'history' action: rehydrate a thread (device switch / reload) ──
    if (body?.action === "history") {
      if (!threadId) return json({ thread_id: null, messages: [] });
      const { data: msgs } = await admin
        .from("support_chat_messages")
        .select("role, content").eq("thread_id", threadId)
        .order("created_at", { ascending: true }).limit(40);
      // Rehydrated history keeps the "Not what I meant" affordance: a fast
      // answer is identified by exact text, so nothing has to be stored twice
      // and an edited reply can never be mistaken for a canned one.
      return json({
        thread_id: threadId,
        messages: (msgs ?? []).map((m) => ({
          role: m.role,
          content: m.content,
          fast: m.role === "assistant" && fastTopicForReply(String(m.content)) !== null,
        })),
      });
    }

    // ── 'delete' action: wipe this conversation (owner-scoped; thread resolved above) ──
    if (body?.action === "delete") {
      if (!threadId) return json({ ok: true });
      const { error: delMsgs } = await admin.from("support_chat_messages").delete().eq("thread_id", threadId);
      if (delMsgs) throw new Error("Could not delete conversation");
      await admin.from("support_chat_threads").delete().eq("id", threadId);
      return json({ ok: true });
    }

    const text = String(body?.text ?? "").trim();
    if (!text) throw new Error("No message");
    if (text.length > 1500) throw new Error("Message too long");
    // A retry replaces the last fast answer in place. It is not a new turn, so
    // no second user message is written and the original question is read from
    // the thread, not trusted from the browser.
    const isRetry = body?.action === "retry";
    if (isRetry && !threadId) throw new Error("Conversation not found");

    if (isGuest) {
      const { count: guestMsgs } = await admin.from("support_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId);
      if ((guestMsgs ?? 0) >= 60) throw new Error("Conversation limit reached — please email outshipai@gmail.com");
    }

    if (!threadId) {
      if (isGuest) {
        const todayStart = new Date(Date.now() - 86400_000).toISOString();
        const { count: threadCount } = await admin.from("support_chat_threads")
          .select("id", { count: "exact", head: true })
          .eq("guest_id", guestId)
          .gte("created_at", todayStart);
        if ((threadCount ?? 0) >= 3) throw new Error("Too many conversations — please email outshipai@gmail.com");
      }
      const row: { guest_id?: string; user_id?: string | null; status: string } = isGuest
        ? { guest_id: guestId, status: "auto" }
        : { user_id: userId, status: "auto" };
      const { data: created, error: cErr } = await admin
        .from("support_chat_threads").insert(row)
        .select("id").single();
      if (cErr || !created) throw new Error("Could not start thread");
      threadId = created.id;
    }
    if (!isRetry) {
      await admin.from("support_chat_messages").insert({
        thread_id: threadId, role: "user", content: text.slice(0, 1500),
      });
      await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    }

    // ── Load the recent window (newest first, then reversed). The old query
    //    took the FIRST 16 messages, so after eight turns the model stopped
    //    seeing the newest question at all. The thread's first user message is
    //    added separately so original context survives without paying for it
    //    in every prompt.
    const HISTORY_LIMIT = 10;
    const { data: recentDesc } = await admin
      .from("support_chat_messages")
      .select("id, role, content").eq("thread_id", threadId)
      .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
    const recentRows = (recentDesc ?? []).slice().reverse();
    const history: Array<{ role: string; content: string }> = recentRows.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 1500),
    }));

    const { data: firstUser } = await admin
      .from("support_chat_messages")
      .select("id, content").eq("thread_id", threadId).eq("role", "user")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (firstUser && !recentRows.some((m) => m.id === firstUser.id)) {
      history.unshift({ role: "user", content: String(firstUser.content).slice(0, 1500) });
    }

    if (isRetry) {
      // Drop the fast answer being replaced. The prompt must end with the
      // user's original question, or the model answers "Not what I meant".
      if (history.length && history[history.length - 1].role === "assistant") history.pop();
      if (!history.length || history[history.length - 1].role !== "user") {
        throw new Error("Nothing to retry");
      }
    }

    // The question this turn must actually answer. For a normal turn it is the
    // message just stored; for a retry it is the original question the fast
    // answer replied to.
    const question = history[history.length - 1].content;

    // Language requirement lives ON the user's own message (system-level nudges
    // get ignored after a long English history; inline wins every time).
    if (containsArabic(question)) {
      const last = history[history.length - 1];
      if (last.role === "user") {
        last.content = `LANGUAGE NOTE — the user wrote to you in ARABIC. You MUST reply in ARABIC (clear, friendly Gulf business tone; keep product terms in English where natural).\n\n${last.content}`;
      }
    }

    // ── Fast lane: a known, whole question answered from versioned text.
    //    Zero model calls, zero tokens, zero quota. Anything mixed, unknown,
    //    money/legal/privacy-related, account-specific or Arabic returned null
    //    and falls through to the AI below.
    const topics = supportTopicHits(question);
    if (!isRetry) {
      const fast = fastSupportAnswer(question);
      if (fast) {
        await admin.from("support_chat_messages").insert({
          thread_id: threadId, role: "assistant", content: fast.reply,
        });
        await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        return json({ reply: fast.reply, thread_id: threadId, fast: true, topic: fast.topic });
      }
    }

    // ── Account context: real numbers so answers are specific, not generic.
//    Guests have no account → stay product-level. ──
    let accountCtx = "";
    let userPlan: string | null = null;
    if (!isGuest) {
    const { data: profile } = await admin.from("profiles")
      .select("name, plan, referral_reward_plan, referral_reward_until, gmail_connected, gmail_state, gmail_email")
      .eq("id", userId).maybeSingle();
    const { data: usage } = await admin.from("usage_limits")
      .select("emails_sent_today, limit_date").eq("user_id", userId).maybeSingle();
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySent = usage && usage.limit_date === todayStr ? Number(usage.emails_sent_today ?? 0) : 0;

    const { count: monthSent } = await admin.from("emails_sent")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId).gte("sent_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .not("gmail_message_id", "is", null);
    const { count: leadCount } = await admin.from("leads")
      .select("*", { count: "exact", head: true }).eq("user_id", userId);
    const { count: campCount } = await admin.from("campaigns")
      .select("*", { count: "exact", head: true }).eq("user_id", userId);
    const { count: activeCampCount } = await admin.from("campaigns")
      .select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active");
    const { count: pendingFus } = await admin.from("leads")
      .select("id", { count: "exact", head: true })
      .eq("followup_status", "active").not("next_followup_at", "is", null)
      .in("campaign_id", (await admin.from("campaigns").select("id").eq("user_id", userId)).data?.map((c: any) => c.id) ?? []);

    // Resolve effective plan incl. referral reward, and whether follow-ups are enabled
    const { data: fuCfg } = await admin.from("campaigns").select("followups_enabled").eq("user_id", userId).limit(1).maybeSingle();
    const effPlanRaw = profile?.plan ?? "starter";
    const rewardPlan = profile?.referral_reward_plan ?? null;
    const rewardUntil = profile?.referral_reward_until ? new Date(profile.referral_reward_until).getTime() : 0;
    let plan = effPlanRaw;
    const ORDER = ["free", "starter", "growth", "agency"];
    if (rewardPlan && ORDER.indexOf(rewardPlan) > -1 && rewardUntil > Date.now() && ORDER.indexOf(rewardPlan) > ORDER.indexOf(plan)) {
      plan = rewardPlan;
    }
    userPlan = plan;

    accountCtx = buildSupportUserContext({
      name: profile?.name ?? null,
      plan,
      gmailConnected: profile?.gmail_connected ?? false,
      gmailEmail: profile?.gmail_email ?? null,
      todaySent,
      monthSent: monthSent ?? 0,
      leads: leadCount ?? 0,
      campaigns: campCount ?? 0,
      activeCampaigns: activeCampCount ?? 0,
      pendingFollowups: pendingFus ?? 0,
      followupsEnabled: fuCfg?.followups_enabled ?? true,
    });
    }

    const arabic = containsArabic(question);
    const guestNote = isGuest
      ? `\n\n## VISITOR MODE
- This person is NOT signed in — they are exploring the site or thinking about signing up.
- Explain OutshipAi and its features clearly and simply. Cover what it does, how it works (finding leads, personalized cold emails from their own Gmail, follow-ups, reply classification), and the free plan.
- If they ask about their account, billing or settings, explain they must create a free account first and point them to Sign up.
- If they mention an email/phone or ask to be contacted, suggest emailing outshipai@gmail.com — never collect personal details.`
      : "";
    const system = `${SUPPORT_SELF_FACTS}

${buildSupportManual(topics)}

${SUPPORT_CONTROLS}

${SUPPORT_FEWSHOTS}

${accountCtx}
${arabic ? "\n\nLANGUAGE REQUIREMENT — the user writes in Arabic. Reply ONLY in Arabic (modern standard Arabic, friendly and clear). Product terms may stay in English where natural." : ""}${guestNote}`;

    // ── Generate the reply through the AI-cost gate (§6.3). Guests get the
    //    shared visitor bucket (openGuestAiCall); signed-in users first consume
    //    the daily chat allowance (M2-style count cap, distinct AI_CHAT_DAILY_CAP
    //    knob), then run inside their normal per-user USD pools (openAiCall).
    //    A refused or degraded mode NEVER surfaces as an error to the visitor:
    //    the reply degrades to a calm static line, zero LLM, zero spend. ──
    // A message that touches two topics must get one directive covering both.
    // The old router returned only the first match, so "my campaign is not
    // sending" could be answered as a campaign tutorial with the sending half
    // silently dropped.
    const topicDirective = topics.length > 1
      ? `## TOPIC DIRECTIVE\nThis message asks about more than one thing: ${topics.join(", ")}. Answer EVERY part directly from the manual. Do not drop a part and do not guess.`
      : routeSupportTopic(question);
    const clockLine = `\n\n## CURRENT UTC TIME\n${new Date().toISOString()}`;
    const promptText = `SYSTEM:\n${system}${clockLine}

## TOPIC DIRECTIVE
${topicDirective}

## CONVERSATION (oldest → newest; the FINAL USER line is the message you must answer right now)
${history
  .map((m: any) => `\n---\n${m.role === "assistant" ? "ASSISTANT" : "USER"}:\n${m.content}`)
  .join("")}`;

    const BUSY_LINE = "I'm catching my breath after a busy stretch — give me a minute and send that again. If it's urgent, email outshipai@gmail.com.";
    const DAILY_LIMIT_LINE = "You've hit today's support-chat limit — it resets each day. For anything urgent, email outshipai@gmail.com.";

    let answer: string | null = null;
    // ── Capability boundary, answered deterministically. "Can I get parent
    //    emails?" is a factual question about our data, so a model must not
    //    answer it: the same prompt that sometimes refuses also sometimes
    //    pivots to a sending tutorial (which is exactly what shipped). No LLM,
    //    no spend, no drift. Arabic still goes through the model so the answer
    //    is in the user's language, with the boundary directive attached.
    if (isPersonalContactRequest(question) && !containsArabic(question)) {
      answer = personalContactAnswer({ signedIn: !isGuest });
    } else if (isGuest) {
      const handle = await openGuestAiCall(admin, { kind: "chat", fn: "support-chat", groqChat, perCallGuard: 0.006 }, 900);
      if (handle.mode === "ai") answer = await handle.run(promptText, { maxTokens: 900, temperature: 0.3 });
      if (!answer) {
        // A retry must never replace a correct fast answer with an outage line.
        if (isRetry) return json({ error: BUSY_LINE }, 503);
        answer = BUSY_LINE;
      }
    } else {
      const chatCap = Number(Deno.env.get("AI_CHAT_DAILY_CAP") ?? 100);
      const { data: allowed, error: quotaError } = await admin.rpc("consume_ai_quota", { uid: userId, cap: chatCap });
      if (quotaError) throw new Error(quotaError.message);
      if (!allowed) {
        if (isRetry) return json({ error: DAILY_LIMIT_LINE }, 429);
        answer = DAILY_LIMIT_LINE;
      } else {
        const handle = await openAiCall(admin, { userId, kind: "chat", fn: "support-chat", plan: userPlan, groqChat, perCallGuard: 0.006 }, 900);
        if (handle.mode === "ai") answer = await handle.run(promptText, { maxTokens: 900, temperature: 0.3 });
        if (!answer) {
          if (isRetry) return json({ error: BUSY_LINE }, 503);
          answer = BUSY_LINE;
        }
      }
    }

    const baseAnswer = redactLegacyProcessor(answer ?? BUSY_LINE);
    // A pricing answer must never imply that online payment works today. If
    // the model dropped one of the two facts, add only the missing sentence;
    // outage lines stay untouched.
    const finalAnswer = answer && answer !== BUSY_LINE && answer !== DAILY_LIMIT_LINE
      ? ensureBillingFacts(baseAnswer, topics, arabic)
      : baseAnswer;

    if (isRetry) {
      // Replace the fast answer in place: one question, one answer, no
      // duplicate turn in the transcript.
      const target = recentRows[recentRows.length - 1];
      if (
        !target || target.role !== "assistant" ||
        fastTopicForReply(String(target.content)) === null
      ) {
        throw new Error("Nothing to retry");
      }
      const { error: upErr } = await admin.from("support_chat_messages")
        .update({ content: finalAnswer.slice(0, 3000) }).eq("id", target.id);
      if (upErr) throw new Error("Could not replace the answer");
      await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      return json({ reply: finalAnswer, thread_id: threadId, fast: false, replaced: true });
    }

    await admin.from("support_chat_messages").insert({
      thread_id: threadId, role: "assistant", content: finalAnswer.slice(0, 3000),
    });
    await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

    return json({ reply: finalAnswer, thread_id: threadId, fast: false, replaced: false });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});