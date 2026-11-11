// Live test of review mode without sending anything.
// Creates two temporary users, inserts held drafts directly (service role),
// then exercises review-queue: skip, approve, and cross-user refusal.
// No Gmail is connected, so the worker cannot send; the assertions only cover
// the queue transitions and the absence of any emails_sent row.
//
// Run: node scripts/.stage8/live-review-test.mjs
const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;

const h = (extra = {}) => ({ "Content-Type": "application/json", apikey: ANON, ...extra });
const svc = { ...h({ Authorization: `Bearer ${SR}` }), Prefer: "return=representation" };

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}

async function makeUser(tag) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `T-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: h({ Authorization: `Bearer ${SR}` }),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  if (!res.ok) throw new Error("create user: " + JSON.stringify(user));
  const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ email, password }),
  });
  const session = await login.json();
  if (!login.ok) throw new Error("login: " + JSON.stringify(session));
  return { id: user.id, token: session.access_token };
}

async function makeDraft(userId, label, existingCampaignId = null) {
  let campaignId = existingCampaignId;
  if (!campaignId) {
    const camp = await (await fetch(`${URL}/rest/v1/campaigns`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ user_id: userId, name: `${label} campaign`, status: "active" }),
    })).json();
    if (!camp?.[0]?.id) throw new Error("campaign insert: " + JSON.stringify(camp));
    campaignId = camp[0].id;
  }
  const lead = await (await fetch(`${URL}/rest/v1/leads`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({ user_id: userId, campaign_id: campaignId, name: "Sam Whitfield", company: "Bright Smile Dental", email: `sam.${label.replace(/[^a-z0-9]/gi, "")}@example.com` }),
  })).json();
  if (!lead?.[0]?.id) throw new Error("lead insert: " + JSON.stringify(lead));
  const queue = await (await fetch(`${URL}/rest/v1/send_queue`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({
      user_id: userId,
      campaign_id: campaignId,
      lead_id: lead[0].id,
      status: "awaiting_review",
      review_state: "awaiting",
      draft_subject: `Quick question about ${label}`,
      draft_body: `Hi Sam,\n\nBright Smile Dental is in Leeds.\n\nBest regards, Alex`,
      draft_meta: {
        facts: [{ id: "f1", kind: "city", value: "Leeds", quote: "Leeds", sourceUrl: "https://www.google.com/maps", checkedAt: new Date().toISOString(), source: "listing" }],
        claims: [{ sentence: "Bright Smile Dental is in Leeds.", fact_ids: ["f1"] }],
        blocked: [],
        held_at: new Date().toISOString(),
      },
    }),
  })).json();
  if (!queue?.[0]?.id) throw new Error("insert draft: " + JSON.stringify(queue));
  return { queueId: queue[0].id, campaignId, leadId: lead[0].id };
}

async function decide(token, id, action) {
  const res = await fetch(`${URL}/functions/v1/review-queue`, {
    method: "POST",
    headers: h({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({ id, action }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const users = [];
try {
  const owner = await makeUser("review-owner");
  users.push(owner.id);
  const other = await makeUser("review-other");
  users.push(other.id);

  // ── skip ────────────────────────────────────────────────────────────────
  const skipDraft = await makeDraft(owner.id, "skip");
  const skipped = await decide(owner.token, skipDraft.queueId, "skip");
  check(skipped.status === 200 && skipped.body?.ok === true, "skip returns 200", JSON.stringify(skipped.body));
  const skipRow = (await (await fetch(`${URL}/rest/v1/send_queue?id=eq.${skipDraft.queueId}&select=status,review_state,last_error,draft_body`, { headers: svc })).json())[0];
  check(skipRow.status === "cancelled", "skip cancels the job", skipRow.status);
  check(skipRow.review_state === "skipped", "skip records the review state");
  check(skipRow.last_error === "skipped_in_review", "skip states the reason");
  check(/Bright Smile Dental is in Leeds/.test(skipRow.draft_body ?? ""), "the stored draft is kept for the record");

  // ── cross-user refusal ──────────────────────────────────────────────────
  const otherDraft = await makeDraft(owner.id, "cross", skipDraft.campaignId);
  const denied = await decide(other.token, otherDraft.queueId, "approve");
  check(denied.status === 409, "another account cannot approve this draft", String(denied.status));
  const untouched = (await (await fetch(`${URL}/rest/v1/send_queue?id=eq.${otherDraft.queueId}&select=status,review_state`, { headers: svc })).json())[0];
  check(untouched.status === "awaiting_review" && untouched.review_state === "awaiting", "the refused draft is untouched");

  // ── approve ─────────────────────────────────────────────────────────────
  const ok = await decide(owner.token, otherDraft.queueId, "approve");
  check(ok.status === 200 && ok.body?.ok === true, "approve returns 200", JSON.stringify(ok.body));
  const approveRow = (await (await fetch(`${URL}/rest/v1/send_queue?id=eq.${otherDraft.queueId}&select=status,review_state,draft_subject`, { headers: svc })).json())[0];
  check(approveRow.review_state === "approved", "approve records the review state", approveRow.status);
  check(approveRow.status !== "awaiting_review", "approve releases the draft from review", approveRow.status);
  check(/Quick question about cross/.test(approveRow.draft_subject ?? ""), "the approved text is the stored text");

  // ── no send happened (no Gmail connected) ───────────────────────────────
  await new Promise((r) => setTimeout(r, 3000));
  const sent = await (await fetch(`${URL}/rest/v1/emails_sent?user_id=eq.${owner.id}&select=id,body`, { headers: svc })).json();
  check(Array.isArray(sent) && sent.length === 0, "nothing was sent without a connected mailbox", String(sent?.length));

  // ── a decided draft cannot be decided twice ─────────────────────────────
  const twice = await decide(owner.token, skipDraft.queueId, "approve");
  check(twice.status === 409, "a skipped draft cannot be approved later", String(twice.status));

  // ── bad input ───────────────────────────────────────────────────────────
  const noAuth = await fetch(`${URL}/functions/v1/review-queue`, { method: "POST", headers: h(), body: JSON.stringify({ id: skipDraft.queueId, action: "approve" }) });
  check(noAuth.status === 401, "no session means no decision", String(noAuth.status));
  const badAction = await decide(owner.token, skipDraft.queueId, "delete");
  check(badAction.status === 400, "an unknown action is refused", String(badAction.status));
} catch (err) {
  console.error("ERROR", err.message);
  failures.push("unexpected error");
} finally {
  for (const id of users) {
    await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: h({ Authorization: `Bearer ${SR}` }) });
  }
  console.log("temp users deleted");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
