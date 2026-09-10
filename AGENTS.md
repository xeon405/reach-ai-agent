# Outreach — developer discipline notes

## Shared-module bundling (hard rule)
- Edge-function bundles **freeze at deploy time**: editing any
  `supabase/functions/_shared/*.ts` does NOT propagate to already-deployed
  functions until their consumers are redeployed. This exact root cause shipped
  the support-chat zero-meter gap (bundle predated the meter) and a 4-function
  sibling class (generate-email/tools/suggest-areas/send-reply, all pre-meter),
  then an `audit.ts` cohort (track-open/network-intros/referral-claim/
  unsubscribe/track-click/gmail-oauth). Also the same shape as the CRON_SECRET
  rotation issue: a change in one place silently doesn't reach running code.
- After every change that touches `_shared/*.ts`, redeploy **every** function
  that (transitively) imports it, preserving each function's `verify_jwt` flag —
  read the flags from the Management API first; deploy `verify_jwt:true`
  functions WITHOUT `--no-verify-jwt`.
- Prove freshness with `node scripts/.ops/sweep-shared-staleness.mjs` — it
  compares each deployed function's bundle age against the last-write of every
  shared module it imports. Exit 1 = stale bundles are listed. Run it as part of
  every `_shared`-touching change; it is the check that makes this rule verifiable.

## SQL validation vs apply (hard rule)
- **Validate first, always, with `scripts/dryrun-sql.mjs`** — it wraps the input in
  `BEGIN...ROLLBACK`, refuses input that manages its own transaction, and (optionally)
  runs a read-only verify query afterward to prove the schema is unchanged.
  Example: `node scripts/dryrun-sql.mjs supabase/migrations/<file>.sql scripts/verify-x.sql`
- **Applying** happens only via `scripts/supabase-sql.mjs` (executes for real) and only
  **after a human approves the diff**. Never chain a validator and an executor in one
  command — that pairing is how a stray executor call applied a migration mid-validation
  (caught and rolled back; see Stage 3 history).
- Delivered guardrails: validator has no write path; executor's header warns; this file
  codifies the rule. A rollback note exists next to every forward migration.

## Review gates (per project plan)
- Each stage: implement code-first → present diff → unit proof → live production proof,
  and wait for explicit sign-off before deploying/applying. No deploy without a review.
- Migration hygiene: one forward migration + one `.rollback.sql` per schema change;
  rollback notes shipped with the migration, and rollback scripts dry-run before shipping.
- Every real production verification gets a teardown of any throwaway fixtures.

## Secrets
- Secrets live in repo-root `.env` (gitignored via `.gitignore`). Never commit tokens.
  Read from `.env` inside tooling; never print token values.

## Environment quirks
- `bash` env does not persist between tool calls — `set -a; . ./.env; set +a` before
  `supabase` CLI commands; run those from the repo root (`.env` lives there).
- `npm install` is currently broken (OpenSSL/TLS) — use existing deps only; `npx tsc --noEmit`
  is the typecheck gate.
- Management API returns the last result set; harmless libuv "Assertion failed" lines on
  Windows Node can be filtered with `grep -v Assertion`.