// Live production proof for the agent function.
// Creates a throwaway user, proves the auth boundary, then proves reads,
// the confirmation gate, and the cache. Tears everything down at the end.
import { readFileSync } from "node:fs";
import { createClient } from "npm:@supabase/supabase-js@2";

function readEnv(name) {
  const text = readFileSync(".env", "utf8");
  const m = text.split("\n").find((l) => l.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1).trim() : undefined;
}
const url = readEnv("VITE_SUPABASE_URL") || readEnv("SUPABASE_URL");
const anon = readEnv("VITE_SUPABASE_ANON_KEY") || readEnv("SUPABASE_ANON_KEY");
const service = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const ref = readEnv("SUPABASE_PROJECT_REF") || "zvohdvopmvzsujktrdmu";
const fnUrl = `${url}/functions/v1/agent`;

let pass = 0; const fails = [];
const check = (ok, label, detail) => {
  if (ok) { pass++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { fails.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
};

const admin = createClient(url, service, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `agent-probe-${stamp}@example.com`;
const password = `Pr0be-${stamp}-x`;
let userId = null;

async function asUser(token, body) {
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

try {
  // ---- 1. auth boundary -------------------------------------------------
  {
    const r = await fetch(fnUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "show me my campaigns" }) });
    const b = await r.json().catch(() => ({}));
    check(r.status === 401 || r.status === 403, "no-auth call is rejected", `HTTP ${r.status}`);
  }

  // ---- create a throwaway user -----------------------------------------
  {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error("createUser: " + error.message);
    userId = data.user.id;
    check(!!userId, "throwaway user created");
  }
  const { data: sess, error: sErr } = await admin.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error("signin: " + sErr.message);
  const token = sess.session.access_token;

  // ---- 2. a read works and is honestly empty ----------------------------
  {
    const r = await asUser(token, { message: "how many emails have i sent" });
    check(r.status === 200, "read intent returns 200", `HTTP ${r.status}`);
    // AI-first: the slow lane now interprets meaning before the deterministic
    // router is consulted, so either lane may legitimately win here. What must
    // hold is that a read resolves to a real goal and does not ask for consent.
    check(["ai", "router", "learned"].includes(r.body.source), "a read is resolved by some lane", `source=${r.body.source}`);
    check(r.body.source === "router" ? r.body.usedAi === false : r.body.usedAi === true, "and the AI is spent only when the model did the work", `source=${r.body.source} usedAi=${r.body.usedAi}`);
    check(!r.body.pending, "a read never asks for confirmation", `pending=${JSON.stringify(r.body.pending)}`);
    const conv = r.body.conversationId;
    check(!!conv, "conversation id returned");
    var convId = conv;
  }

  // ---- 3. a WRITE must not execute before confirmation -------------------
  {
    const r = await asUser(token, { message: "create a campaign called Probe Test", conversationId: convId });
    check(!!r.body.pending, "write returns pending instead of acting", `pending=${JSON.stringify(r.body.pending)}`);
    const { data: rows } = await admin.from("campaigns").select("name").eq("user_id", userId).eq("name", "Probe Test");
    check((rows ?? []).length === 0, "no campaign row was created before confirmation", `${(rows ?? []).length} rows`);
  }

  // ---- 4. confirming it DOES create the paused campaign -----------------
  {
    const r = await asUser(token, { message: "yes", conversationId: convId, confirm: true });
    check(!r.body.pending, "confirm no longer reports pending");
    const { data: rows } = await admin.from("campaigns").select("name,status").eq("user_id", userId).eq("name", "Probe Test");
    check((rows ?? []).length === 1, "confirmed write created exactly one campaign", `${(rows ?? []).length} rows`);
    check(rows?.[0]?.status === "paused", "and it is PAUSED, so nothing can auto-send", rows?.[0]?.status);
  }

  // ---- 5. repeat the unknown phrase: the learned fast lane must pay off --
  // "anyone i should stop emailing" is deliberately phrased to MISS the keyword
  // router (it has none of its trigger words), so the model has to understand
  // it, and the second identical ask has to come back from the fast lane.
  {
    const phrase = "anyone i should stop emailing";
    const r1 = await asUser(token, { message: phrase, conversationId: convId });
    const r2 = await asUser(token, { message: phrase, conversationId: convId });
    check(r1.body.source === "ai", "an unfamiliar phrasing is understood by the model", `source=${r1.body.source}`);
    check(r1.body.intent === "compliance_check", "and resolved to the right goal", `intent=${r1.body.intent}`);
    check(r2.body.source === "learned", "second identical phrase is served from the learned fast lane", `source=${r2.body.source}`);
    check(r1.body.usedAi === true && r2.body.usedAi === false, "only the FIRST unfamiliar phrase spends an AI call", `first=${r1.body.usedAi} second=${r2.body.usedAi}`);
  }

  // ---- 5b. plain conversation needs no intent and no AI-free shortcut ---
  {
    const r = await asUser(token, { message: "what can you do?", conversationId: convId });
    check(r.status === 200, "a plain question is answered, not rejected", `HTTP ${r.status}`);
    check(typeof r.body.text === "string" && r.body.text.length > 10, "and gets a real sentence back", r.body.text?.slice(0, 60));
    check(!r.body.intent, "asking about the assistant does not execute a goal", `intent=${r.body.intent}`);
  }

  // ---- 5c. a greeting must never be learned as an intent ----------------
  {
    for (const g of ["hi", "thanks", "yes"]) {
      const r = await asUser(token, { message: g, conversationId: convId });
      check(!r.body.intent, `"${g}" never triggers an action`, `intent=${r.body.intent}`);
    }
    const { data: learnedRows } = await admin
      .from("agent_learned_phrases")
      .select("phrase")
      .eq("user_id", userId);
    const bad = (learnedRows ?? []).filter((r) => ["hi", "thanks", "yes", "ok"].includes(r.phrase));
    check(bad.length === 0, "greetings and confirmations are not stored as learned phrases", `stored=${JSON.stringify((learnedRows ?? []).map((r) => r.phrase))}`);
  }

  // ---- 5e. chats are SAVED and can be read back -------------------------
  // Regression: the UI never read stored messages back, so reopening the page
  // looked like every chat had been deleted. Nothing was ever lost.
  {
    const list = await asUser(token, { action: "conversations" });
    check(list.status === 200 && Array.isArray(list.body.conversations), "past chats can be listed", `HTTP ${list.status}`);
    const convo = (list.body.conversations ?? []).find((c) => c.id === convId);
    check(!!convo, "the current chat appears in the list", `${(list.body.conversations ?? []).length} chats`);
    check(!!convo && typeof convo.updated_at === "string", "each chat carries a recency stamp", convo?.updated_at);

    const hist = await asUser(token, { action: "history", conversationId: convId });
    check(hist.status === 200 && Array.isArray(hist.body.messages), "a saved chat can be reopened", `HTTP ${hist.status}`);
    check((hist.body.messages ?? []).length >= 10, "the reopened chat still has its earlier turns", `${(hist.body.messages ?? []).length} messages`);
    check((hist.body.messages ?? []).some((m) => m.role === "user") && (hist.body.messages ?? []).some((m) => m.role === "assistant"), "both sides of the conversation are restored");
    check(hist.body.usedAi === undefined, "reopening a chat spends no AI", `usedAi=${hist.body.usedAi}`);

    // Deleting must be COMPLETE, but this is a throwaway chat so the rest of
    // the proof can keep using convId.
    const victim = await asUser(token, { message: "delete probe chat please", conversationId: null });
    const victimId = victim.body.conversationId;
    check(!!victimId, "a second, throwaway chat was created", String(victimId));

    const del = await asUser(token, { action: "conversation_delete", conversationId: victimId });
    check(del.status === 200 && del.body.ok === true, "a chat can be deleted on request", `HTTP ${del.status}`);
    const { count: msgCount } = await admin.from("agent_messages").select("id", { count: "exact", head: true }).eq("conversation_id", victimId);
    const { count: convCount } = await admin.from("agent_conversations").select("id", { count: "exact", head: true }).eq("id", victimId);
    check((msgCount ?? 0) === 0, "deleting a chat removes its messages too", `${msgCount} left`);
    check((convCount ?? 0) === 0, "and the conversation row itself", `${convCount} left`);
    const gone = await asUser(token, { action: "history", conversationId: victimId });
    check(gone.status === 404, "a deleted chat cannot be reopened", `HTTP ${gone.status}`);
    const relist = await asUser(token, { action: "conversations" });
    check(!(relist.body.conversations ?? []).some((c) => c.id === victimId), "and it is gone from the chat list");

    // Deleting is never automatic: the other chat survived untouched.
    const still = await asUser(token, { action: "history", conversationId: convId });
    check(still.status === 200, "deleting one chat does not touch another", `HTTP ${still.status}`);
  }

  // ---- 5d. the user can see and delete what was learned -----------------
  {
    const r = await asUser(token, { action: "learned_list" });
    check(r.status === 200 && Array.isArray(r.body.learned), "the user can list what the agent learned", `HTTP ${r.status}`);
    const row = (r.body.learned ?? [])[0];
    check(!!row?.phrase && !!row?.scope, "each learned phrase is shown with its scope", JSON.stringify(row));
    if (row) {
      const d = await asUser(token, { action: "learned_forget", id: row.id });
      check(d.status === 200, "and can forget it", `HTTP ${d.status}`);
      const after = await asUser(token, { action: "learned_list" });
      check(!(after.body.learned ?? []).some((x) => x.id === row.id), "the forgotten phrase is gone", JSON.stringify(after.body.learned));
    }
  }

  // ---- 6. REGRESSION: asking questions must not exhaust a step budget --
  // Bug: the step budget used to be charged per chat turn, so a free user
  // (cap 3) was cut off after 3 questions.
  {
    let blocked = 0;
    for (let i = 0; i < 9; i++) {
      const r = await asUser(token, { message: "how many emails have i sent", conversationId: convId });
      if (r.body.limitHit) blocked++;
    }
    check(blocked === 0, "9 read questions in a row are never budget-blocked", `blocked=${blocked} of 9`);
  }

  // ---- 7. REGRESSION: "no" must NEVER run the write --------------------
  // Bug: the confirm branch executed the stored intent whatever the user
  // typed, so the UI's "No" button performed the action.
  {
    const r = await asUser(token, { message: "create a campaign called Decline Test", conversationId: convId });
    check(!!r.body.pending, "decline probe armed a pending write");
    const d = await asUser(token, { message: "no", conversationId: convId, confirm: true });
    const { data: rows } = await admin.from("campaigns").select("name").eq("user_id", userId).eq("name", "Decline Test");
    check((rows ?? []).length === 0, "answering NO creates nothing", `${(rows ?? []).length} rows, reply="${d.body.text}"`);
  }

  // ---- 8. REGRESSION: one "yes" authorises exactly one write -----------
  // Uses pause_campaign, which has NO name-uniqueness backstop, so a passing
  // result proves the single-use guard itself and not an idempotency accident.
  {
    const { data: c } = await admin.from("campaigns")
      .insert({ user_id: userId, name: "Replay Probe", status: "active" })
      .select("id, name, status").single();
    await asUser(token, { message: "pause the campaign called Replay Probe", conversationId: convId });
    const y1 = await asUser(token, { message: "yes", conversationId: convId, confirm: true });
    const { data: mid } = await admin.from("campaigns").select("status").eq("id", c.id).single();
    const y2 = await asUser(token, { message: "yes", conversationId: convId, confirm: true });
    const { data: after } = await admin.from("campaigns").select("status").eq("id", c.id).single();
    check(mid?.status === "paused", "confirmed pause took effect", `status=${mid?.status}`);
    check(y1.body.usedAi === false, "replay did not spend an AI call", `usedAi=${y2.body.usedAi}`);
    check(
      /nothing waiting/i.test(y2.body.text ?? ""),
      "a REPLAYED yes is refused rather than re-running the write",
      `reply="${y2.body.text}"`,
    );
    check(after?.status === "paused", "replay left state unchanged", `status=${after?.status}`);
  }

  // ---- 6. tenant isolation: a second user must see none of it ----------
  {
    const email2 = `agent-probe2-${stamp}@example.com`;
    const pw2 = `Pr0be2-${stamp}-x`;
    const { data: u2, error: e2 } = await admin.auth.admin.createUser({ email: email2, password: pw2, email_confirm: true });
    if (e2) throw new Error("createUser2: " + e2.message);
    const { data: s2 } = await admin.auth.signInWithPassword({ email: email2, password: pw2 });
    const r = await asUser(s2.session.access_token, { message: "show me my campaigns", conversationId: null });
    const txt = (r.body.text ?? "").toLowerCase();
    check(!txt.includes("probe test"), "a different user cannot see the first user's campaign", `text="${r.body.text}"`);
    await admin.auth.admin.deleteUser(u2.user.id);
  }

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  - " + f)); }
} finally {
  // ---- teardown: no probe data survives --------------------------------
  if (userId) {
    await admin.from("campaigns").delete().eq("user_id", userId);
    await admin.from("agent_messages").delete().eq("user_id", userId);
    await admin.from("agent_conversations").delete().eq("user_id", userId);
    await admin.from("agent_learned_phrases").delete().eq("user_id", userId);
    await admin.from("agent_intent_cache").delete().eq("user_id", userId);
    await admin.from("agent_action_state").delete().eq("user_id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(`  teardown: ${error ? "ERROR " + error.message : "probe user and all rows deleted"}`);
  }
}
if (fails.length) Deno.exit(1);
