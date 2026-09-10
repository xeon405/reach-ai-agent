// Stage 4 synthetic-data proof. Drives the REAL fold logic from
// supabase/functions/learning-loop/index.ts (bundled unmodified by
// build-learning-loop-test.mjs) against an in-memory supabase-js lookalike.
// Scenarios:
//   1. GDPR/malformed/null-country excluded + counted, never in a bucket
//   2. MIN_SAMPLE gate: a variant just under 25 => winner_variant null
//   3. MIN_DELTA gate: delta >= 0.03 declares a winner; below does not
//   4. Idempotency: re-folding the same window overwrites, never duplicates
//   5. lead_score smoke: hot vs cold lead tiers
// Exits nonzero on any assertion failure.

const LL = await import("./.stage4/learning-loop.test.mjs");

let failures = 0;
const line = (ok, msg) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 0.0006) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// Minimal supabase-js query lookalike over a Map-backed store.
// ---------------------------------------------------------------------------
class FakeDB {
  constructor() { this.store = new Map(); }
  from(t) { if (!this.store.has(t)) this.store.set(t, new Map()); return new Q(this, t); }
  table(t) { if (!this.store.has(t)) this.store.set(t, new Map()); return this.store.get(t); }
}
class Q {
  constructor(db, table) { this.db = db; this.table = table; this._sel = "*"; this._filters = [];
    this._range = null; this._single = false; }
  select(c) { this._sel = c || "*"; return this; }
  not(col, op, val) { this._filters.push({ col, op, val, neg: true }); return this; }
  eq(col, val) { this._filters.push({ col, op: "eq", val, neg: false }); return this; }
  gte(col, val) { this._filters.push({ col, op: "gte", val, neg: false }); return this; }
  range(a, b) { this._range = [a, b]; return this; }
  maybeSingle() { this._single = true; return this; }
  upsert(rows) {
    const map = this.db.table(this.table);
    for (const r of rows) map.set(`u#${map.size}`, { ...r }); // keyed store; fold re-reads row keyed how it selects
    return { error: null };
  }
  then(res, rej) { return this._run().then(res, rej); }
  async _run() {
    const all = [...this.db.table(this.table).values()];
    let out = all.filter((r) => this._filters.every((f) => {
      if (f.op === "is") { const isNull = r[f.col] == null; return f.neg ? !isNull : isNull && f.val === null; }
      const v = r[f.col];
      return f.op === "eq" ? v === f.val : v >= f.val;
    }));
    if (this._sel !== "*") {
      const cols = this._sel.split(",").map((s) => s.trim());
      out = out.map((r) => { const o = {}; for (const c of cols) o[c] = r[c]; return o; });
    }
    if (this._range) { const [a, b] = this._range; out = out.slice(a, b + 1); }
    if (this._single) return { data: out.length ? out[0] : null, error: null };
    return { data: out, error: null };
  }
}
// Rows are stored keyed by an explicit id; upserts must merge on the SAME key
// the real query reads back from, so campaign_learning/strategy_state/lead_score
// upserts use their natural PK as the map key (dedup + overwrite = idempotent).
const pkey = new Map([["lead_score", "lead_id"], ["campaign_learning", "campaign_id"], ["strategy_state", "feature_bucket"]]);
{
  const upsertOriginal = Q.prototype.upsert;
  Q.prototype.upsert = function (rows) {
    const arr = Array.isArray(rows) ? rows : [rows];
    const map = this.db.table(this.table);
    const k = pkey.get(this.table);
    for (const r of arr) map.set(`${this.table}#${k ? r[k] : map.size}`, k ? { ...(map.get(`${this.table}#${r[k]}`) ?? {}), ...r } : r);
    return { error: null };
  };
}

const seed = (db, t, rows) => rows.forEach((r, i) => db.table(t).set(`${t}#${i}`, r));
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();

const { MIN_SAMPLE, MIN_DELTA, MIN_SAMPLE_AGG, MIN_PUBLISH_CELL } = LL.TEST_GATES;
console.log(`constants from real module: MIN_SAMPLE=${MIN_SAMPLE} MIN_DELTA=${MIN_DELTA} MIN_SAMPLE_AGG=${MIN_SAMPLE_AGG} MIN_PUBLISH_CELL=${MIN_PUBLISH_CELL}`);
line(MIN_SAMPLE === 25 && MIN_DELTA === 0.03 && MIN_SAMPLE_AGG === 30 && MIN_PUBLISH_CELL === 5,
  "gates exported by the real module are the expected values");

// ---------------------------------------------------------------------------
// SCENARIO 1 — strategy_state EU/malformed/unknown exclusion
// ---------------------------------------------------------------------------
{
  const db = new FakeDB();
  seed(db, "leads", [
    { id: "l_fr",   category: "restaurant", country: "FR" },            // GDPR (EEA)
    { id: "l_gb",   category: "restaurant", country: "GB" },            // GDPR (UK-GDPR)
    { id: "l_name", category: "restaurant", country: "united states" }, // malformed -> unknown
    { id: "l_null", category: "restaurant", country: null },            // unknown
    { id: "l_us",   category: "restaurant", country: "US" },
    { id: "l_au",   category: "trading",    country: "AU" },
  ]);
  const emails = [];
  for (let i = 0; i < 40; i++) emails.push({ lead_id: "l_us", replied: i < 20, sent_at: iso(6) }); // restaurant 40s/20r
  for (let i = 0; i < 30; i++) emails.push({ lead_id: "l_au", replied: i < 6,  sent_at: iso(6) }); // trading    30s/6r
  for (let i = 0; i < 12; i++) emails.push({ lead_id: "l_fr",   replied: true, sent_at: iso(6) }); // excluded
  for (let i = 0; i < 8;  i++) emails.push({ lead_id: "l_gb",   replied: true, sent_at: iso(6) }); // excluded
  for (let i = 0; i < 5;  i++) emails.push({ lead_id: "l_name", replied: true, sent_at: iso(6) }); // excluded
  for (let i = 0; i < 3;  i++) emails.push({ lead_id: "l_null", replied: true, sent_at: iso(6) }); // excluded
  seed(db, "emails_sent", emails);

  console.log("\nSCENARIO 1 — strategy_state EU/malformed/unknown exclusion");
  console.log("  countryStatus mapping (real fold logic):");
  for (const [raw, want] of [["FR", "gdpr"], ["GB", "gdpr"], ["united states", "unknown"], [null, "unknown"], ["US", "ok"], ["AU", "ok"]]) {
    line(LL.countryStatus(raw) === want, `countryStatus(${JSON.stringify(raw)}) === "${want}"`);
  }

  const r = await LL.foldStrategyState(db);
  const rowByBucket = new Map([...db.table("strategy_state").values()].map((x) => [x.feature_bucket, x]));
  const rest = rowByBucket.get("c:restaurant");
  const trade = rowByBucket.get("c:trading");

  line(r.excluded === 28, `excluded_gdpr counted all 28 excluded emails (got ${r.excluded})`);
  line(r.buckets === 2, `two buckets written (got ${r.buckets})`);
  line(rest && rest.sent === 40 && rest.replied === 20,
    `restaurant bucket = included sends only (40/20, got ${rest?.sent}/${rest?.replied})`);
  line(trade && trade.sent === 30 && trade.replied === 6,
    `trading bucket = included sends only (30/6, got ${trade?.sent}/${trade?.replied})`);
  line(rest && rest.excluded_gdpr === 28, "restaurant row records excluded_gdpr = 28");
  const overall = 26 / 70;
  line(rest && near(rest.deltas.delta_reply, 0.5 - overall), `restaurant delta_reply=${rest?.deltas.delta_reply} (expected ${(0.5 - overall).toFixed(4)})`);
  line(trade && near(trade.deltas.delta_reply, 0.2 - overall), `trading delta_reply=${trade?.deltas.delta_reply} (expected ${(0.2 - overall).toFixed(4)})`);
  line(rowByBucket.size === 2 && !rowByBucket.has("c:unknown"), "no bucket written for excluded-only leads");
  line(rest && rest.model_version === "agg/v1", "model_version is agg/v1");
  const ws = new Date(rest.window_start);
  line(ws.getUTCDay() === 1 && ws.getUTCHours() === 0, "window_start is Monday 00:00 UTC");
}

// ---------------------------------------------------------------------------
// SCENARIO 2 — MIN_SAMPLE gate: winner must NOT be declared below threshold
// ---------------------------------------------------------------------------
{
  const db = new FakeDB();
  const emails = [];
  const v = (cid, id, variant, replied, opts = {}) => ({ campaign_id: cid, lead_id: id, variant, replied,
    opened: opts.opened ?? false, ai_paused: false, subject: null, sent_at: iso(4) });
  // c1: variant a=26 vs b=24 (one just under MIN_SAMPLE) -> gate false
  for (let i = 0; i < 26; i++) emails.push(v("c1", `a${i}`, "a", i < 12, { opened: i < 13 }));
  for (let i = 0; i < 24; i++) emails.push(v("c1", `b${i}`, "b", i < 2));
  // c2: both variants just under (24) -> gate false
  for (let i = 0; i < 24; i++) emails.push(v("c2", `a${i}`, "a", i < 12, { opened: i < 13 }));
  for (let i = 0; i < 24; i++) emails.push(v("c2", `b${i}`, "b", i < 2));
  seed(db, "emails_sent", emails);

  const n = await LL.foldCampaignLearning(db);
  const c1 = [...db.table("campaign_learning").values()].find((x) => x.campaign_id === "c1");
  const c2 = [...db.table("campaign_learning").values()].find((x) => x.campaign_id === "c2");

  console.log("\nSCENARIO 2 — MIN_SAMPLE gate (no winner below 25 per variant)");
  line(n === 2, `two campaigns folded (got ${n})`);
  line(c1 && c1.state.winner_variant === null, "c1 (a=26 vs b=24): winner_variant null (one variant under MIN_SAMPLE)");
  line(c2 && c2.state.winner_variant === null, "c2 (24 vs 24): winner_variant null (both under MIN_SAMPLE)");
  line(c1 && c1.state.variants["v:a"].sent === 26 && c1.state.variants["v:b"].sent === 24, "variant sent counts stored correctly");
  line(c1 && c1.state.min_sample.required === 25, "min_sample gate recorded (required = 25)");
  line(c1 && c1.version === 1, "first fold writes version 1");
}

// ---------------------------------------------------------------------------
// SCENARIO 3 — MIN_DELTA: >= 0.03 declares a winner; below does not
// ---------------------------------------------------------------------------
{
  const db = new FakeDB();
  const emails = [];
  const v = (cid, id, variant, replied, sent) => ({ campaign_id: cid, lead_id: id, variant, replied, opened: true, ai_paused: false, subject: null, sent_at: sent });
  for (let i = 0; i < 50; i++) emails.push(v("c3", `x${i}`, "x", i < 20, iso(3))); // 0.40
  for (let i = 0; i < 50; i++) emails.push(v("c3", `y${i}`, "y", i < 8,  iso(3))); // 0.16 -> delta 0.24
  for (let i = 0; i < 50; i++) emails.push(v("c4", `p${i}`, "x", i < 10, iso(3))); // 0.20
  for (let i = 0; i < 50; i++) emails.push(v("c4", `q${i}`, "y", i < 9,  iso(3))); // 0.18 -> delta 0.02
  seed(db, "emails_sent", emails);

  await LL.foldCampaignLearning(db);
  const c3 = [...db.table("campaign_learning").values()].find((x) => x.campaign_id === "c3");
  const c4 = [...db.table("campaign_learning").values()].find((x) => x.campaign_id === "c4");

  console.log("\nSCENARIO 3 — MIN_DELTA threshold (0.03)");
  line(c3 && c3.state.winner_variant && c3.state.winner_variant.key === "v:x" && c3.state.winner_variant.delta === 0.24,
    "c3 (0.40 vs 0.16): winner declared v:x, delta 0.24");
  line(c4 && c4.state.winner_variant === null, "c4 (0.20 vs 0.18): delta 0.02 < MIN_DELTA -> winner_variant null");
}

// ---------------------------------------------------------------------------
// SCENARIO 4 — idempotency of a repeated fold in the same window
// ---------------------------------------------------------------------------
{
  const db = new FakeDB();
  seed(db, "leads", [
    { id: "l1", category: "restaurant", country: "US" },
    { id: "l2", category: "restaurant", country: "FR" },
  ]);
  const emails = [];
  for (let i = 0; i < 40; i++) emails.push({ lead_id: "l1", replied: i < 10, sent_at: iso(2) }); // restaurant 40/10, FR excluded
  for (let i = 0; i < 6;  i++) emails.push({ lead_id: "l2", replied: true,   sent_at: iso(2) }); // excluded
  for (let i = 0; i < 30; i++) emails.push({ campaign_id: "c5", lead_id: `w${i}`, variant: "a", replied: i < 9, opened: true,  ai_paused: false, subject: null, sent_at: iso(2) });
  for (let i = 0; i < 30; i++) emails.push({ campaign_id: "c5", lead_id: `z${i}`, variant: "b", replied: i < 3, opened: false, ai_paused: false, subject: null, sent_at: iso(2) });
  seed(db, "emails_sent", emails);

  console.log("\nSCENARIO 4 — idempotency of a repeated fold in the same window");
  const s1 = await LL.foldStrategyState(db);
  const s2 = await LL.foldStrategyState(db);
  const stratRows = [...db.table("strategy_state").values()];
  line(stratRows.length === 1, `strategy_state re-fold: no duplicate rows (${stratRows.length} row)`);
  line(s1.excluded === s2.excluded && s1.buckets === s2.buckets, "strategy fold counts identical across re-fold");
  const stratFirst = JSON.stringify(stratRows[0]);

  await LL.foldCampaignLearning(db);
  await LL.foldCampaignLearning(db);
  const c5 = [...db.table("campaign_learning").values()].find((x) => x.campaign_id === "c5");
  line(db.table("campaign_learning").size === 1, "campaign_learning: single row across repeated folds");
  line(c5 && c5.version === 2, `campaign_learning version bumps monotonically 1 -> 2 (got ${c5?.version})`);
  line(c5 && c5.state.variants["v:a"].sent === 30 && c5.state.winner_variant?.key === "v:a", "campaign_learning state identical (counts intact, winner persisted across refold)");
}

// ---------------------------------------------------------------------------
// SCENARIO 5 — lead_score smoke (real scoring path)
// ---------------------------------------------------------------------------
{
  const db = new FakeDB();
  seed(db, "leads", [{ id: "h1", category: "x", country: "US" }, { id: "h2", category: "x", country: "US" }]);
  seed(db, "emails_sent", [
    { lead_id: "h1", replied: true, opened: true, ai_turns: 3, sent_at: iso(1), last_lead_msg_at: iso(1) },
    { lead_id: "h1", replied: true, opened: false, ai_turns: 2, sent_at: iso(2), last_lead_msg_at: null },
    { lead_id: "h2", replied: false, opened: false, ai_turns: 0, sent_at: iso(24 * 24), last_lead_msg_at: null },
  ]);
  seed(db, "ai_classifications", [{ lead_id: "h1", interested: true, booking_intent: false, created_at: iso(1) }]);

  const n1 = await LL.foldLeadScores(db);
  const n2 = await LL.foldLeadScores(db);
  line(n1 === 2 && n2 === 2, `lead_score folds both leads (scored ${n1}, re-scored ${n2})`);
  const h1 = [...db.table("lead_score").values()].find((x) => x.lead_id === "h1");
  const h2 = [...db.table("lead_score").values()].find((x) => x.lead_id === "h2");
  line(h1 && h1.tier === "A" && h1.score >= 0.55, `hot lead -> tier ${h1?.tier} (${h1?.score})`);
  line(h2 && h2.tier === "D" && h2.score < 0.15, `cold lead (last contact ~24d ago) -> tier ${h2?.tier} (${h2?.score})`);
  line(h1 && h1.features.bounced === false && h1.score_version === 1, "features are opaque values; score_version=1");
}

console.log(`\n${failures === 0 ? "ALL ASSERTIONS PASSED" : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);