// Tests for the fast lane. The rule that matters most: a phrase becomes
// account-wide only after being used in a SECOND, DIFFERENT conversation.
// Repeating it many times in one chat must NOT promote it, or one person's
// phrasing becomes everyone's problem.
//
// Run: node scripts/.stage8/agent-learning.test.mjs
import {
  ACCOUNT_SCOPE, describeLearned, isLearnable, listLearned, phraseKey, recall, recordUse, retire,
} from "../../supabase/functions/_shared/agent-learning.ts";

let passed = 0;
const failures = [];
const check = (ok, label, detail) => {
  if (ok) { passed++; console.log(`  ok   ${label}${detail ? " — " + detail : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
};

// In-memory stand-in for the table, with the same query surface we rely on.
function makeDb() {
  const rows = [];
  let nextId = 1;
  const matches = (r, f) => Object.entries(f).every(([k, v]) => k.startsWith("__") || String(r[k]) === String(v));
  const db = {
    rows,
    from: () => {
      const st = { filters: {}, limit: 1, ordered: false };
      const api = {
        select: () => api,
        upsert: async (row) => {
          const existing = rows.find((r) => matches(r, { user_id: row.user_id, scope: row.scope, phrase: row.phrase }));
          if (existing) Object.assign(existing, row);
          else rows.push({ id: nextId++, uses: 0, correct: 0, state: "provisional", ...row });
          return { data: null, error: null };
        },
        update: (patch) => { st.patch = patch; return api; },
        delete: () => { const i = rows.findIndex((r) => matches(r, st.filters)); if (i >= 0) rows.splice(i, 1); return Promise.resolve({ data: null, error: null }); },
        eq: (k, v) => { st.filters[k] = v; return api; },
        neq: (k, v) => { st.filters.__neq = (st.filters.__neq || []).concat([[k, v]]); return api; },
        in: (k, vals) => { st.filters.__in = [k, vals]; return api; },
        order: () => { st.ordered = true; return api; },
        limit: (n) => { st.limit = n; return api; },
        then: (res, rej) => {
          let out = rows.filter((r) => matches(r, st.filters));
          for (const [k, v] of st.filters.__neq ?? []) out = out.filter((r) => r[k] !== v);
          if (st.filters.__in) { const [k, vals] = st.filters.__in; out = out.filter((r) => vals.includes(r[k])); }
          if (st.patch) out.forEach((r) => Object.assign(r, st.patch));
          if (st.ordered) {
            // recall orders by scope DESC, and '*' sorts last in ASCII, so the
            // account-wide row is picked first by the real query.
            out = out.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === ACCOUNT_SCOPE ? -1 : 1));
          }
          out = out.slice(0, st.limit);
          return Promise.resolve({ data: out, error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
  return db;
}

const U = "user-1";
const A = "conv-A", B = "conv-B";

// ---- canonical keys -----------------------------------------------------
check(phraseKey("Get me  LEADS!") === "get me leads", "keys ignore case, spacing and punctuation", phraseKey("Get me  LEADS!"));
check(phraseKey("  show   my campaigns  ") === "show my campaigns", "keys collapse whitespace");

// ---- what must never be learned ----------------------------------------
for (const p of ["yes", "no", "ok", "thanks", "hi", "y", "do it"]) {
  check(!isLearnable(p), `never learns the bare word "${p}"`);
}
check(!isLearnable("ok"), "never learns a 2-char string");
check(isLearnable("show me my campaigns"), "learns a real instruction");

// ---- first hearing is provisional, scoped to that chat ------------------
{
  const db = makeDb();
  await recordUse(db, U, "show me my campaigns", "list_campaigns", {}, A, null);
  const r = db.rows[0];
  check(r?.scope === A, "first hearing is scoped to the chat that taught it", r?.scope);
  check(r?.state === "provisional", "and starts provisional");
  check(r?.uses === 1 && r?.correct === 1, "counts the use");
}

// ---- repeating in the SAME chat must NOT promote ------------------------
{
  const db = makeDb();
  await recordUse(db, U, "show me my campaigns", "list_campaigns", {}, A, null);
  let row = await recall(db, U, "show me my campaigns", A);
  for (let i = 0; i < 9; i++) await recordUse(db, U, "show me my campaigns", "list_campaigns", {}, A, row);
  row = await recall(db, U, "show me my campaigns", A);
  check(db.rows[0].scope === A, "ten uses in one chat stay scoped to that chat", db.rows[0].scope);
  check(db.rows[0].state === "provisional", "and stay provisional");
  check(db.rows[0].uses === 10, "uses are still counted", String(db.rows[0].uses));
}

// ---- use in a SECOND chat promotes to account-wide ---------------------
{
  const db = makeDb();
  await recordUse(db, U, "get me leads", "find_contacts", { city: "Dubai" }, A, null);
  const row = await recall(db, U, "get me leads", B);
  await recordUse(db, U, "get me leads", "find_contacts", { city: "Dubai" }, B, row);
  check(db.rows[0].scope === ACCOUNT_SCOPE, "a second, different chat promotes it", db.rows[0].scope);
  check(db.rows[0].state === "account", "and marks it account-wide");
}
{
  const db = makeDb();
  await recordUse(db, U, "get me leads", "find_contacts", {}, A, null);
  // A provisional phrase is NOT served in another chat: it was one person's
  // phrasing and has not been proven to be a team habit yet.
  const fromOther = await recall(db, U, "get me leads", B);
  check(fromOther === null, "a provisional phrase is not auto-served in another chat", String(fromOther?.scope));
  // But the slow lane resolving the same words in chat B is the evidence that
  // promotes it, so recordUse must find that row across scopes.
  await recordUse(db, U, "get me leads", "find_contacts", {}, B, fromOther);
  check(db.rows.length === 1, "and it promotes the existing row instead of duplicating it", String(db.rows.length));
  check(db.rows[0].state === "account", "the same words resolving in a second chat earn account scope", db.rows[0].state);
  check(db.rows[0].scope === ACCOUNT_SCOPE, "and move to account scope", db.rows[0].scope);
}

// ---- account-wide wins over a chat-local guess -------------------------
{
  const db = makeDb();
  db.rows.push({ id: 1, user_id: U, scope: ACCOUNT_SCOPE, phrase: "give me numbers", intent: "campaign_stats", params: {}, state: "account", uses: 3, correct: 3 });
  db.rows.push({ id: 2, user_id: U, scope: A, phrase: "give me numbers", intent: "list_campaigns", params: {}, state: "provisional", uses: 1, correct: 1 });
  const r = await recall(db, U, "give me numbers", A);
  check(r?.intent === "campaign_stats", "the account-wide mapping wins over a chat-local one", r?.intent);
}

// ---- retirement --------------------------------------------------------
{
  const db = makeDb();
  await recordUse(db, U, "show me my campaigns", "list_campaigns", {}, A, null);
  await retire(db, U, "show me my campaigns", A);
  check(db.rows[0].state === "retired", "a wrong mapping is retired");
  const r = await recall(db, U, "show me my campaigns", A);
  check(r === null, "a retired phrase is never served again", String(r));
}
{
  const db = makeDb();
  await recordUse(db, U, "pause the thing", "pause_campaign", {}, A, null);
  await recordUse(db, U, "pause the thing", "pause_campaign", {}, B, await recall(db, U, "pause the thing", B));
  await retire(db, U, "pause the thing", null);
  check(db.rows[0].state === "retired", "an account-wide phrase can be retired too");
}

// ---- learning is per-account, never shared -----------------------------
{
  const db = makeDb();
  await recordUse(db, U, "get me leads", "find_contacts", {}, A, null);
  const other = await recall(db, "user-2", "get me leads", A);
  check(other === null, "one account's vocabulary is invisible to another", String(other));
}

// ---- what the user sees ------------------------------------------------
{
  const db = makeDb();
  await recordUse(db, U, "get me leads", "find_contacts", {}, A, null);
  await recordUse(db, U, "get me leads", "find_contacts", {}, B, await recall(db, U, "get me leads", B));
  const view = describeLearned(db.rows);
  check(view[0].scope === "everyone on this account", "promoted phrases are shown as shared", view[0].scope);
  check(typeof view[0].uses === "number" && view[0].uses === 2, "and count both sightings", String(view[0].uses));
}

// ---- the fast lane is an optimisation, never a dependency --------------
// If the table is missing (migration not yet applied) or a write fails, the
// agent must still answer - just via the model. Learning must never 500 a chat.
{
  const broken = {
    from: () => {
      const api = {
        select: () => api, upsert: async () => { throw new Error("relation does not exist"); },
        update: () => { throw new Error("relation does not exist"); },
        eq: () => api, neq: () => api, in: () => api, order: () => api, limit: () => api,
        then: (res, rej) => Promise.resolve({ data: null, error: { message: "relation does not exist" } }).then(res, rej),
      };
      return api;
    },
  };
  let threw = false;
  try { await recordUse(broken, U, "show me my campaigns", "list_campaigns", {}, A, null); } catch { threw = true; }
  check(!threw, "a failed learning write does not throw into the chat path");
  const r = await recall(broken, U, "show me my campaigns", A);
  check(r === null, "a missing table reads as 'nothing learned yet'");
  check((await listLearned(broken, U)).length === 0, "listing a missing table returns empty, not an error");
  threw = false;
  try { await retire(broken, U, "show me my campaigns", A); } catch { threw = true; }
  check(!threw, "a failed retire does not throw either");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("FAILURES:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("NO FAILURES");
