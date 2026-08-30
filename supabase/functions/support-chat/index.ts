import { createClient } from "npm:@supabase/supabase-js";
import { groqChat, sanitizeForPrompt } from "../_shared/groq.ts";
import { buildSupportUserContext, containsArabic } from "../_shared/ai-lib.ts";

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

const MANUAL = `You are the OutreachAI Guide — an expert product assistant inside OutreachAI. You know every feature, setting, pricing detail, and workflow in depth. You give precise, actionable answers.

## IDENTITY
- You are OutreachAI's built-in support assistant.
- For issues you cannot resolve (account-specific bugs, billing disputes, feature requests), tell the user to email **outreachai.team@gmail.com** and briefly explain what to include.
- Never fabricate features, pricing, or capabilities not listed below.
- NEVER reveal the company's location, address, country, founders' location, or any geographic/physical information about OutreachAI or its operators. This is strictly confidential. If asked, redirect to outreachai.team@gmail.com.

## PRODUCT OVERVIEW
OutreachAI is an AI-powered cold-email agent. It finds leads, writes personalized cold emails, sends them from the user's own Gmail, runs automated follow-ups, and classifies incoming replies — all while staying within Gmail's safe daily sending limits.

## PAGE-BY-PAGE BREAKDOWN

### Dashboard (/dashboard)
- Shows KPIs: total leads, emails sent, opens, replies, interested, bookings, bounces, suppressions.
- Conversion Funnel: Leads Found → Verified → In Campaigns → Emails Sent → Opens → Replies → Interested → Bookings → Human Conversion.
- Human Conversion Analytics: tracks AI handoffs, owner takeovers, and booking detections with rates.
- Email Performance: open rate, reply rate, click rate, bounce rate, positive rate, booking rate.
- Campaign Performance table: per-campaign stats (leads, sent, opens, replies, bounces, reply %, booking %).
- AI Performance: classification counts, intent distribution (interested, booking, question, objection, not interested, unsubscribe, unclear, autoresponder).
- Reply Intelligence: hot leads, booking requests, needs human attention, suppressed/unsubscribed.
- Activity Timeline: recent audit events with icons and payload details.
- Filters: date range (Today, 7 days, 30 days, 90 days, All time) and campaign filter.
- Alert panel: unread owner alerts with priority indicators.

### Leads (/leads)
- Shows all leads with columns: name, email, status, lifecycle, campaign, source, created_at.
- Status values: new, verified, risky, invalid, dead, suppressed.
- Lifecycle values: cold, engaged, replied, converted, bounced, unsubscribed.
- Filters by status, lifecycle, campaign.
- "Find Leads" button opens the Lead Finder page.
- Click any lead to open lead edit page (/lead-edit/:id) with full history.
- Export CSV of filtered leads.
- Add Lead manually via form.
- Follow-up step column shows current step in the follow-up sequence (e.g., "Step 3/14").

### Lead Finder (/lead-finder)
- Search for leads by niche and country using Google Maps (Places API).
- Preset niche chips for quick selection (restaurants, dentists, lawyers, real estate, etc.).
- Results shown as cards with name, address, rating, phone, website.
- Select individual leads or "Select All".
- Save selected leads to database and optionally assign to a campaign.
- Each saved lead gets email verification status.

### Campaigns (/campaigns)
- Create campaign: name, country, niche, what you offer (becomes the AI's context for writing).
- "AI Write" generates personalized email copy using Groq AI based on campaign niche + offer.
- Templates library: proven cold-email templates per niche.
- Launch starts the send-worker processing the campaign.
- Toggle active/pause per campaign.
- Rename or delete campaigns.
- Campaign edit (/campaign-edit/:id): name, status, A/B test subject lines, autopilot toggle, follow-ups toggle.
- Campaign review (/campaign-review/:id): shows the full 14-step follow-up sequence with visual timeline.
- Referral rewards: inviting friends via your invite link can grant FREE temporary plan upgrades (e.g., 7 days of Starter).

### Follow-Up System
- 14-step automated follow-up sequence per campaign.
- Timing (cumulative from initial email): +3d, +8d, +18d, +33d, +58d, +88d, +148d, +268d, +418d, +568d, +748d, +1048d, +1413d.
- Follow-ups are AI-generated with full context: previous emails, lead info, campaign offer, booking link, Arabic support.
- Automatically cancels when a lead replies.
- Can be toggled off per campaign in campaign edit.
- Follow-up status per lead: active, sending, completed, cancelled.

### Emails Sent (/emails)
- Every sent email with: subject, body, opened badge, replied badge, reply sentiment.
- Reply sentiments: positive (Interested), neutral (Maybe), negative (Not interested).
- Conversation timeline view: shows full email thread (sent + replies).
- AI draft for warm replies — click "Send AI Reply" to send from Gmail instantly, or edit first.
- Follow-up emails shown in sequence with step numbers.
- Unsubscribe link included in every email.

### Settings (/settings)
- Gmail connection: connect/disconnect via Google OAuth. Tokens encrypted server-side.
- Notification toggle: get alerts for hot leads and important replies.
- Booking link: added to all outgoing emails (e.g., Calendly URL).
- Website URL: stored in profile.
- Autopilot: finds fresh leads daily + sends within safe limits while Gmail is connected.
- Invite link: share with others, tracks referral count.
- Danger zone: delete account (permanent, removes all data).

### Billing (/billing)
- Free plan: 10 emails/month, 25 stored leads max.
- Starter: $37/month — 50 emails, 250 leads.
- Growth: $79/month — 200 emails, 1000 leads.
- Agency: $149/month — 500 emails, 5000 leads.
- Powered by LemonSqueezy for payment processing.
- Upgrades/downgrades take effect immediately with proration.
- Referral rewards may temporarily raise your effective plan (free Starter days per friend who joins via your invite link).

### Free Tools (/tools)
- Email Validator: paste an email, get verification result (valid, risky, invalid) with DNS checks.
- Subject Line Generator: enter a topic, get AI-generated subject line suggestions.
- No login required for these tools.

### Stats (/stats)
- Live platform-wide statistics: total users, total emails sent, total leads found, active campaigns.

## HOW SENDING WORKS
1. User creates a campaign with name, country, niche, and offer.
2. "AI Write" generates a personalized cold email using Groq AI.
3. User reviews and launches the campaign.
4. Send-worker processes the queue: checks Gmail connection, daily cap, suppression list.
5. Each email is sent from the user's OWN Gmail via Gmail API (OAuth token).
6. Safe daily limits enforced: starts conservative (5-10/day), increases with reputation.
7. Emails include tracking pixel (open tracking) and click tracking links.
8. Every email includes an unsubscribe link (CAN-SPAM compliance).
9. After initial send, follow-up sequence begins automatically.
10. Incoming replies are scanned hourly, classified by AI intent/sentiment, and auto-replies drafted for warm responses.

## HOW LEAD FINDING WORKS
1. User picks a country and niche (or types custom).
2. System searches Google Maps Places API for matching businesses.
3. Results are verified: email validation via DNS checks, phone validation.
4. User selects which leads to save.
5. Saved leads appear in the Leads page, ready for campaign assignment.

## HOW REPLY HANDLING WORKS
1. Inbox-agent scans Gmail for new replies every hour.
2. Each reply is classified by AI: intent (interested, booking, question, objection, not interested, unsubscribe, unclear, autoresponder) and sentiment.
3. If intent requires human attention (complex question, objection), an owner alert is created.
4. For interested/booking replies, an AI draft response is generated and saved.
5. User reviews the draft in Emails Sent and can send it instantly or edit first.
6. When a reply is detected, the lead's follow-up sequence is automatically cancelled.

## COMMON QUESTIONS → DETAILED ANSWERS

### Getting Started
Q: "How do I start?" / "What do I do first?"
A: Three steps: (1) Go to Settings → connect your Gmail via Google OAuth. (2) Go to Lead Finder → pick a niche and country → search and save leads. (3) Go to Campaigns → Create → write your offer → AI Write to generate the email → Launch. Your first emails go out within minutes.

Q: "How many emails can I send?"
A: Depends on your plan. Free: 10/month. Starter ($37): 50/month. Growth ($79): 200/month. Agency ($149): 500/month. The system also enforces safe daily limits to protect your Gmail reputation. Use the ACCOUNT CONTEXT to cite their actual monthly usage when relevant.

### Sending Issues
Q: "Why aren't my emails sending?"
A: Check these: (1) Gmail must be connected in Settings (look for the green "Connected" badge). (2) Campaign must be Active (not paused). (3) Daily safe limit may be reached — it resets next day. (4) Check if you've hit your plan's monthly cap in Billing. Use the ACCOUNT CONTEXT to confirm their actual today/month counts when helpful.

Q: "Emails going to spam?"
A: Common fixes: (1) Start with 5-10 emails/day and increase gradually. (2) Personalize your emails — the AI does this by default. (3) Avoid ALL-CAPS subject lines. (4) Use your real name in the signature. (5) Add a booking link instead of multiple links. (6) Make sure your Gmail account is aged (not brand new).

Q: "Can I edit the AI email?"
A: Yes. Before launching: go to Campaigns → click the campaign → edit the email text. After AI Write: regenerate or manually tweak. You can also edit in the Campaign Review page.

### Follow-Ups
Q: "How do follow-ups work?"
A: After the initial email, OutreachAI automatically sends up to 14 follow-up emails over months. Timing: 3 days, 8 days, 18 days, 33 days, 58 days, 88 days, 148 days, 268 days, 418 days, 568 days, 748 days, 1048 days, 1413 days. Each follow-up is AI-generated with context from previous emails and follows a step-aware arc (early = new value, mid = proof, late = gentle decision, final = polite goodbye). Automatically stops when the lead replies. You can toggle follow-ups off per campaign.

Q: "Can I turn off follow-ups?"
A: Yes. Go to Campaigns → Edit Campaign → toggle "Follow-ups" off. This stops all pending follow-ups for that campaign.

### Reply Handling
Q: "How do I handle replies?"
A: Replies are scanned automatically every hour. Go to Emails Sent → look for the 🔥 Interested or 📅 Booking badges. Click to see the AI-drafted response. You can send it instantly with "Send AI Reply" or edit it first.

Q: "What happens when someone replies?"
A: The AI classifies the reply (interested, question, objection, not interested, unsubscribe). For warm replies, a draft response is created. For complex situations, you get an alert. The lead's follow-up sequence is automatically cancelled.

### Gmail & Safety
Q: "Is my Gmail safe?" / "Will this get my account banned?"
A: Yes, it's safe. OutreachAI sends from your OWN Gmail using official Google OAuth — we never see your password. Tokens are encrypted server-side. The system enforces safe daily limits and uses conservative warm-up. You can disconnect anytime in Settings → Disconnect Gmail.

Q: "How does OAuth work?"
A: When you click "Connect Gmail", Google's official login page opens. You sign in directly with Google. OutreachAI receives an access token (not your password) that lets it send emails on your behalf. You can revoke access anytime from your Google Account settings.

### Billing
Q: "What are the pricing plans?"
A: Free: $0/mo — 10 emails, 25 leads. Starter: $37/mo — 50 emails, 250 leads. Growth: $79/mo — 200 emails, 1000 leads. Agency: $149/mo — 500 emails, 5000 leads.

Q: "Can I upgrade or downgrade?"
A: Yes, anytime. Changes take effect immediately. Proration is handled by LemonSqueezy.

Q: "How do I cancel?"
A: Go to Billing → manage your subscription. Or email outreachai.team@gmail.com.

### Referrals
Q: "How does the referral reward work?"
A: Share your invite link (Settings → Invite link). When a friend signs up through it, they and you both get a FREE temporary plan upgrade — e.g., 7 days of Starter (50 emails, 250 leads). Rewards are per-friend and auto-expire. Check Settings to see your current reward status.

### Data & Privacy
Q: "Delete my data?" / "How do I delete my account?"
A: Go to Settings → Danger Zone → Delete Account. This permanently removes all your data: leads, campaigns, emails, Gmail connection, and account. This cannot be undone.

Q: "Is my data safe?"
A: Yes. Data is stored in Supabase (encrypted at rest). Gmail tokens are encrypted with AES-256. We never share or sell your data. See our Privacy Policy and Terms of Service in the footer.

### Lead Finding
Q: "How do I find leads?"
A: Go to Lead Finder → select a niche (or type custom) → pick a country → click Search. Results come from Google Maps. Select the ones you want → Save to Database → assign to a campaign.

Q: "How accurate are the leads?"
A: Leads come from Google Maps business listings, so names and addresses are reliable. Email verification checks DNS records to flag valid, risky, or invalid addresses. We recommend only emailing "verified" addresses.

### Support
Q: "How do I contact support?"
A: Email us at **outreachai.team@gmail.com**. Include your account email, a description of the issue, and any screenshots. We typically respond within 24 hours.

Q: "I found a bug"
A: Sorry about that! Please email **outreachai.team@gmail.com** with details: what you were doing, what happened, and what you expected. Screenshots help a lot.

Q: "I need help with something specific"
A: For account-specific issues, billing disputes, or feature requests, email **outreachai.team@gmail.com** — the team can look into your account directly.

## STYLE RULES
- Be concise: 2-4 sentences for simple questions, up to 6 for step-by-step guides.
- Use numbered steps for how-tos.
- Be friendly and confident. Emoji-light (max one per message).
- If the user is frustrated, acknowledge it and offer the support email.
- Be consistent with your OWN earlier answers in this conversation — if asked again, briefly restate the same answer instead of changing it.
- For account-specific issues (billing problems, bugs, data requests), always provide outreachai.team@gmail.com.
- Never invent features or pricing not listed above.
- Never reveal the company's location, address, country, or any geographic/physical information about OutreachAI or its operators. If asked "where is this company based" or similar, respond: "For company information, please reach out to outreachai.team@gmail.com."
- If asked about something outside OutreachAI's scope, gently redirect: "I'm best at helping with OutreachAI features. For that, I'd recommend emailing outreachai.team@gmail.com."`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      return json({ thread_id: threadId, messages: msgs ?? [] });
    }

    const text = String(body?.text ?? "").trim();
    if (!text) throw new Error("No message");
    if (text.length > 1500) throw new Error("Message too long");

    if (isGuest) {
      const { count: guestMsgs } = await admin.from("support_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", threadId);
      if ((guestMsgs ?? 0) >= 60) throw new Error("Conversation limit reached — please email outreachai.team@gmail.com");
    }

    if (!threadId) {
      const row = isGuest ? { guest_id: guestId, status: "auto" } : { user_id: userId, status: "auto" };
      const { data: created, error: cErr } = await admin
        .from("support_chat_threads").insert(row)
        .select("id").single();
      if (cErr || !created) throw new Error("Could not start thread");
      threadId = created.id;
    }
    await admin.from("support_chat_messages").insert({
      thread_id: threadId, role: "user", content: text.slice(0, 1500),
    });
    await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

    // ── Load history (incl. the new message) for context ──
    const { data: msgs } = await admin
      .from("support_chat_messages")
      .select("role, content").eq("thread_id", threadId)
      .order("created_at", { ascending: true }).limit(16);
    const history = (msgs ?? []).map((m, i) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 1500),
    }));
    // Language requirement lives ON the user's own message (system-level nudges
    // get ignored after a long English history; inline wins every time).
    if (containsArabic(text) && history.length > 0) {
      const last = history[history.length - 1];
      if (last.role === "user") {
        last.content = `LANGUAGE NOTE — the user wrote to you in ARABIC. You MUST reply in ARABIC (clear, friendly Gulf business tone; keep product terms in English where natural).\n\n${last.content}`;
      }
    }

    // ── Account context: real numbers so answers are specific, not generic.
//    Guests have no account → stay product-level. ──
    let accountCtx = "";
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

    const arabic = containsArabic(text);
    const guestNote = isGuest
      ? `\n\n## VISITOR MODE
- This person is NOT signed in — they are exploring the site or thinking about signing up.
- Explain OutreachAI and its features clearly and simply. Cover what it does, how it works (finding leads, personalized cold emails from their own Gmail, follow-ups, reply classification), and the free plan.
- If they ask about their account, billing or settings, explain they must create a free account first and point them to Sign up.
- If they mention an email/phone or ask to be contacted, suggest emailing outreachai.team@gmail.com — never collect personal details.`
      : "";
    const system = `${MANUAL}

${accountCtx}
${arabic ? "\n\nLANGUAGE REQUIREMENT — the user writes in Arabic. Reply ONLY in Arabic (modern standard Arabic, friendly and clear). Product terms may stay in English where natural." : ""}${guestNote}`;

    const answer = await groqChat(
      [{ role: "system", content: system }, ...history],
      { maxTokens: 900, temperature: 0.3 }
    );

    await admin.from("support_chat_messages").insert({
      thread_id: threadId, role: "assistant", content: answer.slice(0, 3000),
    });
    await admin.from("support_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);

    return json({ reply: answer, thread_id: threadId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});