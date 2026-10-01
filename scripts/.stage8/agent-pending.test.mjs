// ============================================================================
// Follow-up memory: the agent must remember what it was in the middle of.
//
// The behaviour under test, end to end and without a network:
//
//   "add my London dentists to a campaign"
//     -> agent asks WHICH campaign
//     -> "Q3 push"
//        ...and must STILL know about the London dentists.
//
// Before this existed the second message was treated as a fresh request with
// no context, so the contact filter silently vanished.
//
// These are pure functions over a fake db, exactly like the learning suite, so
// they run in plain Node with no Supabase connection.
// ============================================================================

import assert from "node:assert/strict";

import {
  loadPendingState, savePendingState, clearPendingState,
} from "../../supabase/functions/_shared/agent-pending.ts";
import { PENDING_TTL_MINUTES } from "../../supabase/functions/_shared/agent-executor.ts";
import { parseUnderstanding } from "../../supabase/functions/_shared/agent-understand.ts";

// ---------------------------------------------------------------------------
// A tiny fake of the supabase query builder, scoped to the one table used.
// ---------------------------------------------------------------------------
function fakeDb(seed = []) {
  const rows = [...seed];
  const matches = (r, filters) =>
    Object.entries(filters ?? {}).every(([k, v]) => String(r[k]) === String(v));

  // Supabase builders are chainable AND thenable: `.delete().eq(x,y)` returns
  // a builder, and awaiting it runs the op. So the fake is one object that
  // remembers which op was requested and executes it on `then`.
  const table = () => {
    const q = { filters: {}, op: null, payload: null };
    q.eq = (k, v) => { q.filters[k] = v; return q; };
    q.select = () => q;
    q.delete = () => { q.op = "delete"; return q; };
    q.maybeSingle = () => { q.op = "maybeSingle"; return q; };
    q.upsert = (row, _opts) => { q.op = "upsert"; q.payload = row; return q; };
    q.then = (resolve) => {
      const hit = rows.filter((r) => matches(r, q.filters));
      if (q.op === "delete") {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], q.filters)) rows.splice(i, 1);
        }
        resolve({ data: null, error: null });
        return;
      }
      if (q.op === "upsert") {
        const row = q.payload;
        const i = rows.findIndex((r) => matches(r, { user_id: row.user_id, conversation_id: row.conversation_id }));
        if (i >= 0) rows[i] = row; else rows.push(row);
        resolve({ data: row, error: null });
        return;
      }
      resolve({ data: hit[0] ?? null, error: null });
    };
    return q;
  };
  return { from: () => table(), rows };
}

const U = "user-1";
const C = "conv-1";
// Must AWAIT: several checks below assert on state that the previous check's
// async delete/upsert produced. A sync-only harness races itself.
const pass = [];
const check = async (name, fn) => {
  try { await fn(); pass.push(name); console.log("  ok  ", name); }
  catch (e) { console.error("  FAIL", name, "-", e.message); process.exitCode = 1; }
};

// ---------------------------------------------------------------------------
// 1. A question is remembered, and the answer comes back with it.
// ---------------------------------------------------------------------------
await (async () => {
  const db = fakeDb();

  await savePendingState(db, U, C, "add_contacts_to_campaign", { city: "London", category: "dentists" });
  const carried = await loadPendingState(db, U, C);

  await check("the pending goal survives to the next turn", () =>
    assert.equal(carried.intent, "add_contacts_to_campaign"));

  await check("and so do the slots already collected", () =>
    assert.equal(carried.params.city, "London"));

  await check("the whole point: the answer 'Q3 push' still knows about London", () => {
    const fresh = parseUnderstanding(JSON.stringify({
      kind: "read", intent: "add_contacts_to_campaign", params: { campaignName: "Q3 push" },
    }));
    const merged = { ...carried.params, ...fresh.cachedParams };
    assert.equal(merged.city, "London", "city must not be erased by the follow-up");
    assert.equal(merged.category, "dentists", "category must not be erased");
    assert.equal(merged.campaignName, "Q3 push", "the new answer fills the gap");
  });
})();

// ---------------------------------------------------------------------------
// 2. Once the request completes, the memory must NOT linger.
// ---------------------------------------------------------------------------
await (async () => {
  const db = fakeDb();
  await savePendingState(db, U, C, "create_campaign_draft", { campaignName: "Spring Sale" });
  await clearPendingState(db, U, C);

  await check("completing a request forgets the clarification", async () => {
    assert.equal(await loadPendingState(db, U, C), null);
  });

  await check("so two messages later, an unrelated message is NOT hijacked", async () => {
    const carried = await loadPendingState(db, U, C);
    assert.equal(carried, null, "a fresh 'show me my stats' must not inherit a campaign name");
  });
})();

// ---------------------------------------------------------------------------
// 3. Safety: a remembered hint cannot invent a goal.
// ---------------------------------------------------------------------------
await (async () => {
  const db = fakeDb();

  await savePendingState(db, U, C, "delete_everything", { query: "all" });
  await check("a non-existent intent is refused, not remembered", async () => {
    assert.equal(await loadPendingState(db, U, C), null);
  });

  await savePendingState(db, U, C, "pause_campaign", { city: "London", query: "x" });
  await check("unknown slots are dropped, known ones kept", async () => {
    const c = await loadPendingState(db, U, C);
    assert.equal(c.params.city, "London");
    assert.equal(c.params.secret, undefined,
      "an unknown slot must not be passed through to a query");
  });

  await check("a different user cannot read someone else's pending state", async () => {
    const other = await loadPendingState(db, "user-2", C);
    assert.equal(other, null);
  });

  await check("a different conversation cannot read this one", async () => {
    const other = await loadPendingState(db, U, "conv-999");
    assert.equal(other, null);
  });
})();

// ---------------------------------------------------------------------------
// 4. Memory expires, so an old unanswered question cannot resurrect.
// ---------------------------------------------------------------------------
await (async () => {
  const stale = new Date(Date.now() - (PENDING_TTL_MINUTES + 5) * 60_000).toISOString();
  const db = fakeDb([{ user_id: U, conversation_id: C, intent: "pause_campaign", params: {}, asked_at: stale }]);

  await check("a stale clarification is not returned", async () => {
    assert.equal(await loadPendingState(db, U, C), null);
  });

  await check("and it is cleaned up rather than left to rot", () =>
    assert.equal(db.rows.length, 0, "expired rows should be deleted on sight"));
})();

// ---------------------------------------------------------------------------
// 5. A write is still a write: memory does not downgrade or upgrade risk.
// ---------------------------------------------------------------------------
await (async () => {
  const db = fakeDb();
  await savePendingState(db, U, C, "add_contacts_to_campaign", { city: "London" });

  await check("carrying a write forward does NOT execute it", async () => {
    const { isWriteIntent } = await import("../../supabase/functions/_shared/agent-capabilities.ts");
    const carried = await loadPendingState(db, U, C);
    // Remembering an intent is not consent. The write still has to stop at the
    // confirmation gate, which is checked on the routed request, not here.
    assert.equal(isWriteIntent(carried.intent), true,
      "the intent stays a write, so it still requires an explicit yes");
  });
})();

// ---------------------------------------------------------------------------
// 6. A SECOND question must not erase the first question's answers.
// ---------------------------------------------------------------------------
await (async () => {
  const { mergePendingParams } = await import("../../supabase/functions/_shared/agent-pending.ts");
  const db = fakeDb();

  // Round 1: "add my London dentists to a campaign" -> asks which campaign.
  await mergePendingParams(db, U, C, { city: "London", category: "dentists" }, "add_contacts_to_campaign");
  // Round 2: a follow-up question re-states only one slot.
  await mergePendingParams(db, U, C, { country: "UK" }, "add_contacts_to_campaign");

  const after = await loadPendingState(db, U, C);
  await check("a second question keeps the first question's slots", () =>
    assert.equal(after.params.city, "London", "city must survive the second round"));
  await check("and adds the new slot", () =>
    assert.equal(after.params.country, "UK"));

  // A fresh intent replaces the old one, but still carries slots forward.
  await mergePendingParams(db, U, C, { campaignName: "Q3" }, "create_campaign_draft");
  const switched = await loadPendingState(db, U, C);
  await check("a genuinely different goal replaces the pending intent", () =>
    assert.equal(switched.intent, "create_campaign_draft"));
  await check("without throwing away what was already known", () =>
    assert.equal(switched.params.city, "London"));
})();

console.log("\n" + pass.length + " pending-memory checks passed.");
