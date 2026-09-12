#!/usr/bin/env bash
# Standing pre-deploy routine for THIS project's edge functions.
# Usage:  bash scripts/.ops/deploy-fn.sh <fn-slug> [more-slugs...]
# Guarantees, in order:
#   1. The shared-module staleness sweep runs FIRST and BLOCKS the deploy if any
#      NON-targeted function is running a bundle older than an imported _shared
#      module. The functions named in THIS invocation are exempt pre-deploy,
#      because deploying them IS the fix for their own staleness (previously the
#      gate aborted even when every stale function was named, forcing a one-off
#      direct `supabase functions deploy` bypass).
#   2. Every function's verify_jwt flag is read from the Management API and
#      preserved on the deploy (a mismatch silently changes the auth posture).
#   3. A final, UNSCOPED sweep after deploying confirms the WHOLE fleet is at 0
#      stale -- a partial fix (target deployed but still stale, or another fn
#      stale) must fail loudly, never look clean.
# This exists because edited _shared/*.ts never reaches running functions until
# redeploy (see AGENTS.md "Shared-module bundling") -- the sweep is the check
# that makes that rule checkable on demand.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ "$#" -lt 1 ]; then echo "usage: bash scripts/.ops/deploy-fn.sh <fn-slug> [...]" >&2; exit 2; fi

set -a; . ./.env; set +a   # SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
REF="${SUPABASE_PROJECT_REF}"

echo "== pre-deploy staleness sweep (scoped: deploy targets exempt -> $*) =="
node scripts/.ops/sweep-shared-staleness.mjs --exempt "$@" || {
  echo "ABORT: a stale shared-module bundle exists OUTSIDE this deploy's targets ($*)." >&2
  echo "       Deploying $* would not fix it -- redeploy the stale function(s) or include them here." >&2
  exit 1
}

for FN in "$@"; do
  JWT=$(node -e "
    import('./scripts/.ops/_db.mjs').then(async ({getEnv})=>{
      const j=await fetch('https://api.supabase.com/v1/projects/'+getEnv('SUPABASE_PROJECT_REF')+'/functions',{headers:{Authorization:'Bearer '+getEnv('SUPABASE_ACCESS_TOKEN')}}).then(r=>r.json());
      const f=j.find(x=>x.slug==='$FN');
      process.stdout.write(String(f?.verify_jwt ?? 'missing'));
    })")
  # Two explicit pre-deploy states:
  #   deployed earlier   -> preserve that function's verify_jwt flag verbatim.
  #   local-only (never deployed) -> FIRST deploy, SUPABASE default posture
  #                                   (verify_jwt ON). There is no prior flag to
  #                                   preserve; default-on is the secure choice.
  #   neither (typo/unknown)      -> abort.
  if [ ! -d "supabase/functions/$FN" ] && [ "$JWT" = "missing" ]; then
    echo "ABORT: '$FN' has no local function dir and is not deployed (unknown slug?)." >&2
    exit 1
  fi
  FLAGS=(--project-ref "$REF")
  if [ "$JWT" = "missing" ]; then
    echo "== deploying $FN (FIRST deploy; new function, verify_jwt default ON) =="
  elif [ "$JWT" = "false" ]; then
    FLAGS+=(--no-verify-jwt)
    echo "== deploying $FN (verify_jwt=$JWT preserved) =="
  else
    echo "== deploying $FN (verify_jwt=$JWT preserved) =="
  fi
  supabase functions deploy "$FN" "${FLAGS[@]}" | grep -v "update regularly"
done

echo "== post-deploy staleness sweep (UNSCOPED: whole fleet must be clean) =="
node scripts/.ops/sweep-shared-staleness.mjs || {
  echo "ABORT: the post-deploy sweep is STILL stale -- this deploy did not fully fix staleness. Inspect the sweep output above." >&2
  exit 1
}