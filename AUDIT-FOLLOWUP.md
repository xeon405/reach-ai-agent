# Follow-up safety audit & hardening — 2026-09-12

Status: shipped (migration applied, send-worker v58 deployed, proofs green).

## Scope

End-to-end audit of the "autopilot follow-up" pipeline: who drives it, what
governs tempo, and whether "zero chance" of sending after a reply is met.
The four audit questions and their answers:

### 1. What actually drives follow-ups?

- Only `send-worker` PASS 1 (`processDueFollowUps`) sends follow-ups. It runs on
  the external cron (CRON_SECRET), one pass per scheduled run.
- `inbox-agent`'s 05:00 UTC "autopilot top-up" is **lead sourcing**, not
  follow-up driving: it replenishes the autopilot campaign to its lead floor and
  fires `send-campaign`. Follow-ups advance only inside send-worker PASS 1.

### 2. How is follow-up pace governed?

- Same daily budget as first-touch sends: `resolveDailyCap` (plan tier → warm-up
  ramp → ceiling) and the same atomic daily slot (`profiles.emails_sent_today`
  via `reserve_send_slot`).
- Gap found: PASS 1 had **no pacing and no runtime ceiling** (PASS 2 paces each
  queued dispatch with `DELAY_MS=8000` and runs under `RUNTIME_MS`). A burst of
  due leads could hammer the same daily slots back-to-back.
- Fixed: PASS 1 now paces each processed lead by the same `DELAY_MS` and stops
  at the same `RUNTIME_MS` ceiling (breaks at loop top). PASS 1 still runs
  before PASS 2 within the shared invocation budget.

### 3. Is "zero chance after a reply" met?

Two windows existed:

1. **Detection lag** (largest): `emails_sent.replied` is set by inbox-agent's
   scan; cancellation is only ever as fresh as that scan. Window = scan cadence.
   **Accepted residual** — inbox-agent scans minutely and an event-driven Gmail
   push is disproportionate for this stage. Documented, not fixed.
2. **Mid-flight 'sending' window**: after PASS 1 claims a lead (`active →
   'sending'`), the reply-cancel trigger only cancelled `followup_status =
   'active'`, so a reply landing mid-flight did nothing until the next run —
   and the worker's own re-check had already read pre-send state.
   **Now closed** by both:
   - `send-worker` pre-send emitted-state re-check (re-reads lead state,
     `replied`, suppression fresh immediately before sending; abort releases the
     slot, cancels the lead, audits `followup.cancelled / pre_send_recheck`).
   - Reply-cancel trigger now matches `followup_status IN ('active','sending')`
     (migration `20260912000000_followup_sendwindow_hardening.sql`; `paused` and
     `completed` left untouched).

### 4. Is the AI learning loop actually personalized?

- `next_sequence_hint`: the **consumer is built** (send-worker reads via
  `getNextSequenceHint`, gated by the campaign_learning kill-switch + 36h
  staleness bound), but the **producer is deferred**: learning-loop always
  writes `next_sequence_hint: null`, so prompts are byte-identical to baseline
  and campaign_learning attribution never fires.
- Decision: descoped, documented as "CONSUMER BUILT, PRODUCER DEFERRED" in
  INTELLIGENCE-LAYER-DESIGN.md and the fold comment in learning-loop. Re-enabling
  later is low-friction: the consumer already self-gates behind the kill-switch,
  so folding the key just makes campaigns opt in.

## The 13-step ~4-year seed

`20260827100000_followup_engine.sql` seeds `follow_up_sequences` with cumulative
delays 3, 8, 18, 33, 58, 88, 148, 268, 418, 568, 748, 1048, 1413 days with a step
14 of +1413 (increments 3,5,10,15,25,30,60,120,150,180,240,300,365). The
migration comment labels the previous set "WRONG" and this one "Required"
("match exact spec"), so it is deliberate per that migration — but no external
spec authority exists. Recommendation: replace with a shorter realistic default
(2–5 touches over 2–4 weeks).

## Dry-run + scoping (new)

`send-worker` gains a read-only evaluation mode. Gated on the same credentials
as a real pass (cron secret, or the service role key where recoverable):

- `x-followup-dry-run: 1` (or `?dry=1`): PASS 1 runs the full decision pipeline
  with **no sends and no writes** — no reclaim, no CAS claim, no slot reserve,
  no AI-gate call, no emails_sent insert, no advance, no audit writes. Response:
  `{ dry: true, at, followupsSent, followupsCancelled, dryDecisions: [...] }`.
- `x-followup-only: id1,id2` (credential-gated, only honored when dry): scopes
  the due query to specific leads so an evaluation is deterministic.

Decision kinds: `cancel` (reason), `completed`, `completed_no_sequence`,
`already_sent`, `deferred_1h`, `gmail_disconnected`, `pre_send_recheck`,
`would_send`.

Note on credentials: this project's functions run `verify_jwt=false` and the
service key embedded in the function env is not recoverable from the platform,
so dry-run accepts the cron secret as a credential. The service-role path is
unchanged for projects where it is reachable.

## Proofs

Both harnesses drive the real DB via the Management-API query endpoint and
tear down all fixtures.

- Sim (pre-deploy, pure SQL replica of PASS 1 with verbatim predicates):
  `node scripts/.ops/prove-followup-safety-sim.mjs` → all checks pass
  (3 would_send paced ≥ 2×DELAY_MS; budget below one paced lead ⇒ exactly 1
  decision; predicate matrix blocks unsubscribed/suppressed/BOUNCED/HUMAN/
  lost-claim/replied/suppressed at pre-send).
- Live (post-deploy): `node scripts/.ops/prove-followup-safety-live.mjs` → all
  checks pass:
  - trigger tolerance: reply while `sending` ⇒ `cancelled`, `next_followup_at`
    NULL, no worker cancel audit (trigger-only);
  - dry-run: 3 `would_send` (step 2) + `cancel already_replied` +
    `cancel suppression_list`; counters 0 sent / 2 cancelled;
  - pacing 28.2s elapsed (≥ 2×8000ms), under invocation budget;
  - read-only: no sequence-2 rows, lead A untouched, daily slot unchanged;
  - teardown verified (ephemeral users gone).

## Deployment provenance

- Migration `20260912000000_followup_sendwindow_hardening.sql` applied via the
  Management-API query endpoint (see `scripts/.ops/_db.mjs`).
- `send-worker` deployed via `bash scripts/.ops/deploy-fn.sh send-worker`
  (v58, verify_jwt preserved).
- `intelligence-reads.ts` gained and then reverted a comment-only descope edit;
  its mtime was restored so the shared-bundle staleness sweep stays clean
  (the descope note lives in INTELLIGENCE-LAYER-DESIGN.md and learning-loop).
- Pre/post deploy: `0 function(s) running a stale shared-module bundle`.