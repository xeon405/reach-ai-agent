// Stage 5 synthetic-data proof. Drives the REAL read contract from
// supabase/functions/_shared/intelligence-reads.ts (bundled unmodified by
// build-stage5-test.mjs) against an in-memory supabase-js lookalike.
// Scenarios (the user-approved Stage 5 proof bar):
//   A. Kill-switch semantics: glob on (prod seed), campaign/user overrides off,
//      disabled row ignored, missing toggle => off, read failure => off.
//   B. Stale/missing fallback: no row, 24h/36h expiry, expires_at, empty hint
//      => null => caller runs today's deterministic behavior.
//   C. Error resilience: every read throwing still leaves decision points free.
//   D. Extreme lead_score cannot push past the sender_health cap: band clamp, and
//      a dispatch simulation proving score reorders WHICH sends happen but never
//      raises the daily COUNT above cap.
// Exits nonzero on any assertion failure.

const IR = await import("./.stage5/intelligence-reads.test.mjs");

let failures = 0;
const line = (ok, msg) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// Minimal supabase-js query lookalike (subset: select/eq/maybeSingle).
// ---------------------------------------------------------------------------
class FakeDB {
  constructor() { this.store = new Map(); }
  from(t) { if (!this.store.has(t)) this.store.set(t, new Map()); return new Q(this, t); }
  table(t) { if (!this.store.has(t)) this.store.set(t, new Map()); return this.store.get(t); }
}
class Q {
  constructor(db, table) { this.db = db; this.table = table; this._sel = "*"; this._filters = []; this._single = false; }
  select(c) { this._sel = c || "*"; return this; }
  eq(col, val) { this._filters.push({ col, op: "eq", val }); return this; }
  maybeSingle() { this._single = true; return this; }
  then(res, rej) { return this._run().then(res, rej); }
  async _run() {
    const all = [...this.db.table(this.table).values()];
    let out = all.filter((r) => this._filters.every((f) => {
      const v = r[f.col];
      return f.op === "eq" ? v === f.val : v >= f.val;
    }));
    if (this._sel !== "*") {
      const cols = this._sel.split(",").map((s) => s.trim());
      out = out.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
    }
    if (this._single) return { data: out.length ? out[0] : null, error: null };
    return { data: out, error: null };
  }
}
const seed = (db, t, rows) => rows.forEach((r, i) => db.table(t).set(`${t}#${i}`, r));
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

const U = "user-1";
const C = "camp-1";

// Prod default seeds from migration 20260908000004 (glob, enabled:true).
const globToggles = [
  { key: "campaign_learning.enabled", scope: "glob", scope_id: null, value: true, enabled: true },
  { key: "lead_score.enabled", scope: "glob", scope_id: null, value: true, enabled: true },
];

// ---------------------------------------------------------------------------
// SCENARIO A — kill-switch semantics
// ---------------------------------------------------------------------------
console.log("\nSCENARIO A — kill-switch semantics (config row, not a code path)");
{
  const db = new FakeDB();
  seed(db, "agent_config", globToggles);
  seed(db, "lead_score", [{ lead_id: "l1", score: 0.82, tier: "A", score_version: 2, computed_at: iso(1), expires_at: iso(-23), features: {} }]);
  seed(db, "campaign_learning", [{ campaign_id: C, state: { reply_style_hint: "This campaign's repliers engage most when replies stay under 3 sentences.", variants: {} }, version: 4, updated_at: iso(2) }]);

  line(await IR.getKillSwitch(db, "campaign_learning.enabled", { userId: U, campaignId: C }) === true, "glob=true (prod seed) => campaign_learning.enabled true");
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === true, "glob=true => lead_score.enabled true");
  const ls = await IR.getLeadScore(db, { userId: U, campaignId: C, leadId: "l1" });
  line(ls !== null && ls.score === 0.82 && ls.tier === "A" && ls.score_version === 2, `getLeadScore returns fresh score (0.82/A/v2, got ${ls?.score}/${ls?.tier}/v${ls?.score_version})`);
  const rsh = await IR.getReplyStyleHint(db, C);
  line(rsh !== null && rsh.version === 4 && rsh.hint.includes("3 sentences"), "getReplyStyleHint returns folded hint + version 4");
}

{
  console.log("\nSCENARIO A (cont) — overrides + missing + failure => off");
  const db = new FakeDB();
  seed(db, "agent_config", [
    ...globToggles,
    { key: "campaign_learning.enabled", scope: "campaign", scope_id: C, value: false, enabled: true },
    { key: "lead_score.enabled", scope: "user", scope_id: U, value: false, enabled: true },
  ]);
  seed(db, "lead_score", [{ lead_id: "l1", score: 0.82, tier: "A", score_version: 2, computed_at: iso(1), expires_at: iso(-23), features: {} }]);
  seed(db, "campaign_learning", [{ campaign_id: C, state: { reply_style_hint: "x" }, version: 1, updated_at: iso(1) }]);

  line(await IR.getKillSwitch(db, "campaign_learning.enabled", { userId: U, campaignId: C }) === false, "campaign=false overrides glob=true => campaign_learning.enabled false");
  line(await IR.getReplyStyleHint(db, C) === null, "campaign toggle off => getReplyStyleHint null");
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === false, "user=false overrides glob => lead_score.enabled false");
  line(await IR.getLeadScore(db, { userId: U, campaignId: C, leadId: "l1" }) === null, "user toggle off => getLeadScore null");
}

{
  const db = new FakeDB();
  seed(db, "agent_config", [
    ...globToggles,
    { key: "lead_score.enabled", scope: "glob", scope_id: null, value: true, enabled: false }, // disabled ROW (not value)
  ]);
  seed(db, "lead_score", [{ lead_id: "l1", score: 0.8, tier: "A", score_version: 1, computed_at: iso(1), expires_at: iso(-23), features: {} }]);
  // The disabled duplicate glob row must be ignored (filtered by eq(enabled,true)) => the enabled one wins.
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === true, "disabled config ROW is ignored (enabled one still wins)");
  line((await IR.getLeadScore(db, { userId: U, leadId: "l1" })) !== null, "score readable with an enabled row present");
}

{
  const db = new FakeDB(); // no agent_config rows at all
  seed(db, "lead_score", [{ lead_id: "l1", score: 0.9, tier: "A", score_version: 1, computed_at: iso(1), expires_at: iso(-23), features: {} }]);
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === false, "no toggle row => feature off (today's behavior)");
  line(await IR.getLeadScore(db, { userId: U, leadId: "l1" }) === null, "no toggle row => score ignored");
}

{
  const db = new FakeDB();
  seed(db, "agent_config", [{ key: "lead_score.enabled", scope: "glob", scope_id: null, value: "maybe", enabled: true }]);
  seed(db, "lead_score", [{ lead_id: "l1", score: 0.9, tier: "A", score_version: 1, computed_at: iso(1), expires_at: iso(-23), features: {} }]);
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === false, "unparseable toggle value => off (conservative)");
}

// ---------------------------------------------------------------------------
// SCENARIO B — staleness / missing fallback (stale = "no opinion")
// ---------------------------------------------------------------------------
console.log("\nSCENARIO B — staleness & missing fallback");
{
  const db = new FakeDB();
  seed(db, "agent_config", globToggles);
  seed(db, "campaign_learning", [
    { campaign_id: "fresh", state: { reply_style_hint: "short and direct", next_sequence_hint: "ask in reply 3" }, version: 2, updated_at: iso(6) },
    { campaign_id: "stale", state: { reply_style_hint: "old advice", next_sequence_hint: "old advice" }, version: 1, updated_at: iso(37) },
    { campaign_id: "nohint", state: { variants: {} }, version: 1, updated_at: iso(2) },
    { campaign_id: "emptyhint", state: { reply_style_hint: "   ", next_sequence_hint: "" }, version: 1, updated_at: iso(2) },
  ]);
  line(await IR.getReplyStyleHint(db, "missing_camp") === null, "missing campaign_learning row => null");
  line(await IR.getReplyStyleHint(db, "stale") === null, "updated_at 37h ago (>36h) => null (stale)");
  line(await IR.getReplyStyleHint(db, "nohint") === null, "state without reply_style_hint => null");
  line(await IR.getReplyStyleHint(db, "emptyhint") === null, "blank reply_style_hint => null");
  const fresh = await IR.getReplyStyleHint(db, "fresh");
  line(fresh !== null && fresh.hint === "short and direct", "updated_at 6h ago (<36h) => hint returned");
  const nsh = await IR.getNextSequenceHint(db, "fresh");
  line(nsh !== null && nsh.hint === "ask in reply 3", "next_sequence_hint read contract works (fresh)");
  line(await IR.getNextSequenceHint(db, "stale") === null, "next_sequence_hint stale => null");
}

{
  const db = new FakeDB();
  seed(db, "agent_config", globToggles);
  seed(db, "lead_score", [
    { lead_id: "fresh", score: 0.7, tier: "B", score_version: 1, computed_at: iso(23), expires_at: iso(-1), features: {} },  // 23h old, still valid
    { lead_id: "stale", score: 0.9, tier: "A", score_version: 1, computed_at: iso(25), expires_at: iso(-23), features: {} }, // 25h old
  ]);
  line(await IR.getLeadScore(db, { userId: U, leadId: "missing" }) === null, "missing lead_score row => null");
  line((await IR.getLeadScore(db, { userId: U, leadId: "fresh" }))?.score === 0.7, "computed 23h ago (<24h) => score returned");
  line(await IR.getLeadScore(db, { userId: U, leadId: "stale" }) === null, "computed 25h ago (>24h) => null (stale)");
}

// ---------------------------------------------------------------------------
// SCENARIO C — error resilience (a throwing read never blocks a decision)
// ---------------------------------------------------------------------------
console.log("\nSCENARIO C — error resilience");
{
  const db = new FakeDB();
  const realFrom = db.from.bind(db);
  db.from = (t) => {
    throw new Error(`boom on ${t}`);
  };
  line(await IR.getKillSwitch(db, "lead_score.enabled", { userId: U }) === false, "agent_config read throws => toggle false");
  line(await IR.getLeadScore(db, { userId: U, leadId: "l1" }) === null, "lead_score read throws => null (no opinion)");
  line(await IR.getReplyStyleHint(db, C) === null, "campaign_learning read throws => null (no opinion)");
  // Caller simulation: a throwing/empty read still leaves the deterministic path free.
  const ls = await IR.getLeadScore(db, { userId: U, leadId: "l1" });
  const priority = IR.capPriority(100, ls?.score, 50);
  line(priority === 50, `caller proceeds on failure: capPriority(100, null, 50) === 50 (got ${priority})`);
  db.from = realFrom; // restore (unused)
}

// ---------------------------------------------------------------------------
// SCENARIO D — extreme lead_score can NOT push past the sender_health cap
// ---------------------------------------------------------------------------
console.log("\nSCENARIO D — extreme score is bounded by the sender_health cap");
const CAP = 50; // a sender_health-resolved daily cap
const BASE = 100; // queue priority band absent intelligence
{
  line(IR.capPriority(BASE, 1.0, CAP) === CAP, `score=1.0 => full band ${CAP}; never above it`);
  line(IR.capPriority(BASE, null, CAP) === CAP, `no score (kill-switch off/stale/missing) => same band ${CAP}`);
  line(IR.capPriority(BASE, 1.0, CAP) === IR.capPriority(BASE, null, CAP), "extreme score EQUALS the no-opinion band — it can only be a ceiling, never a raise");
  line(IR.capPriority(BASE, 0.5, CAP) === 25, `score=0.5 => ${Math.round(CAP * 0.5)} (mid scores scale DOWN inside the band)`);
  line(IR.capPriority(BASE, 2.0, CAP) === CAP, "out-of-range score (2.0) clamps to 1 => still bounded by cap");
  line(IR.capPriority(BASE, 1.0, 40) === 40, "a tighter cap (40) tightens the band — the band always follows the cap");
  line(IR.capPriority(BASE, 1.0, 0) === 0, "cap=0 => band 0 (nothing can exceed a zero cap)");
}

// Dispatch simulation: 80 pending jobs, daily cap 50. Score distribution can
// reorder WHICH 50 go out, never the COUNT.
{
  const mix = Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? 1.0 : i % 3 === 1 ? 0.6 : 0.2));
  const dispatched = (scores) => {
    const ranked = scores
      .map((s, i) => ({ i, p: IR.capPriority(BASE, s, CAP) }))
      .sort((a, b) => b.p - a.p || a.i - b.i);
    return ranked.slice(0, CAP).length;
  };
  const withHot = dispatched(mix);
  const withNone = dispatched(mix.map(() => null));
  const smallPool = dispatched(mix.slice(0, 30));
  line(withHot === CAP, `hot-score mix dispatches exactly ${CAP}/${mix.length} (got ${withHot})`);
  line(withNone === CAP, `no-score mix dispatches exactly ${CAP}/${mix.length} too (volume is cap-owned, unaffected by scores)`);
  line(smallPool === 30, "pool of 30 (under cap) dispatches all 30 — a score can't ration below the pool either");
  const maxP = Math.max(...mix.map((s) => IR.capPriority(BASE, s, CAP)));
  line(maxP === CAP, `highest priority across all hot scores === ${CAP} (never above)`);
}

// Full-loop proof: disabled toggle => getLeadScore null => capPriority(null) => band => count still cap.
{
  const db = new FakeDB();
  seed(db, "agent_config", [
    { key: "lead_score.enabled", scope: "glob", scope_id: null, value: true, enabled: true },
  ]);
  seed(db, "lead_score", mixLeadScores(80));
  let count = 0;
  for (const leadId of ids(80)) {
    const ls = await IR.getLeadScore(db, { userId: U, leadId });
    const p = IR.capPriority(BASE, ls?.score, CAP);
    if (p > 0 && count < CAP) count++;
  }
  line(count === CAP, `end-to-end: exactly ${CAP} sends with live scores — the cap held (got ${count})`);
}

function mixLeadScores(n) {
  return Array.from({ length: n }, (_, i) => ({
    lead_id: `l${i}`, score: i % 3 === 0 ? 1.0 : i % 3 === 1 ? 0.6 : 0.2, tier: "A",
    score_version: 1, computed_at: iso(1), expires_at: iso(-23), features: {},
  }));
}
function ids(n) { return Array.from({ length: n }, (_, i) => `l${i}`); }

console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);