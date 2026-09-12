import { execSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getEnv } from "./_db.mjs";

// Regression test for the deploy-fn.sh gate change (2026-09-12):
//  - Pre-deploy sweep is now SCOPED: it exempts the functions being deployed in
//    this invocation (deploying them is the fix for their own staleness) but
//    still aborts on stale NON-targeted functions.
//  - Post-deploy sweep stays UNSCOPED so a partial fix can never look clean.
//
// Fabrication strategy (skew-independent): a throwaway function importing a
// throwaway _shared file is deployed, then its imported file's mtime is forced
// to the first whole second strictly past `updated_at` (git-bash `touch -d @sec`;
// fs.utimesSync throws EINVAL for every value on this Node/win32 setup). That is
// stale by the sweep's exact predicate (`changedAt > updated_at`, both epoch-ms)
// and stays fixable by a redeploy, whose updated_at advances beyond it by real
// elapsed time. Worked precedent: the earlier NEW/STALE distinction test used
// the same deploy-then-touch approach.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLUG = "reg-test-gate";
const OTHER = "get-calendly-config";
const FUNC_DIR = join(ROOT, "supabase", "functions", SLUG);
const SENTRY = join(ROOT, "supabase", "functions", "_shared", "reg-test-gate-sentry.ts");
const API = `https://api.supabase.com/v1/projects/${getEnv("SUPABASE_PROJECT_REF")}/functions`;
const HDRS = { Authorization: `Bearer ${getEnv("SUPABASE_ACCESS_TOKEN")}`, "Connection": "close" };

const logs = [];
let failures = 0;
const check = (name, ok, extra = "") => {
  logs.push(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (cmd) => {
  try {
    const body = execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    return { code: 0, body };
  } catch (e) {
    return { code: e.status ?? 1, body: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const getFns = () => fetch(API, { headers: HDRS }).then((r) => r.json());
const fn = (list, slug) => list.find((x) => x.slug === slug);
const deployFn = (slug) => run(`bash scripts/.ops/deploy-fn.sh ${slug}`);

// The Management-API function list is eventually consistent right after a
// deploy; settle() waits until the platform reliably sees the slug.
async function settle(slug, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const f = fn(await getFns(), slug);
    if (f) { await delay(1200); return f; }
    await delay(700);
  }
  return null;
}
async function pollUntilGone(slug, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!fn(await getFns(), slug)) return true;
    await delay(700);
  }
  return false;
}

async function teardown() {
  try { rmSync(FUNC_DIR, { recursive: true, force: true }); rmSync(SENTRY, { force: true }); } catch {}
  await fetch(API + `/${SLUG}`, { method: "DELETE", headers: HDRS }).catch(() => {});
}

(async () => {
  await teardown(); // idempotent start

  mkdirSync(FUNC_DIR, { recursive: true });
  writeFileSync(SENTRY, `export const REG_TEST_GATE_SENTRY = "sentry-v1";\n`);
  writeFileSync(
    join(FUNC_DIR, "index.ts"),
    `import { REG_TEST_GATE_SENTRY } from "../_shared/reg-test-gate-sentry.ts";\n\nDeno.serve((_req) => new Response(REG_TEST_GATE_SENTRY));\n`,
  );

  // --- 1. baseline: deploy the throwaway fn through the wrapper (gate is green)
  let r = deployFn(SLUG);
  check("baseline deploy of throwaway fn via wrapper succeeds", r.code === 0 && r.body.includes("Deployed Functions."), `code=${r.code}`);
  if (r.code !== 0) { logs.push(r.body.slice(-800)); throw new Error("cannot baseline-deploy; aborting"); }

  const mine = await settle(SLUG);
  const U0 = mine?.updated_at;
  check("platform has settled on the throwaway deploy", mine !== null && Number.isFinite(U0), `updated_at=${U0}`);
  check("throwaway fn deployed with verify_jwt default ON", mine?.verify_jwt === true, `v${mine?.version}`);

  // --- 2. fabricate staleness: first whole second strictly past updated_at
  const sec = Math.floor(U0 / 1000) + 1;
  const mtimeSet = sec * 1000;
  const touched = run(`bash -c "touch -d '@${sec}' '${SENTRY.split("\\").join("/")}'"`);
  check("mtime set to a whole second strictly past updated_at", touched.code === 0 && statSync(SENTRY).mtimeMs === mtimeSet, `mtimeMs=${statSync(SENTRY).mtimeMs} vs updated_at=${U0}`);

  let sweep = run("node scripts/.ops/sweep-shared-staleness.mjs");
  if (!(sweep.code === 1 && sweep.body.includes(`STALE ${SLUG}`))) { await delay(2500); sweep = run("node scripts/.ops/sweep-shared-staleness.mjs"); }
  check("unscoped sweep now reports fabricated STALE (truthful fleet-wide tally)", sweep.code === 1 && sweep.body.includes(`STALE ${SLUG}`), `code=${sweep.code}`);
  check("unscoped sweep on stale state exits 1 (post-deploy is the same unscoped call => partial fix never looks clean)", sweep.code === 1, "exit!=0 while stale");

  // --- 3. TEST A: target a DIFFERENT, healthy function -> must still ABORT
  const otherBefore = fn(await getFns(), OTHER);
  r = deployFn(OTHER);
  check("non-targeted stale bundle still aborts the wrapper", r.code !== 0 && r.body.includes("ABORT"), `code=${r.code}`);
  check("ABORT message names the OUTSIDE target", r.body.includes(`OUTSIDE this deploy's targets (${OTHER})`));
  const otherAfter = fn(await getFns(), OTHER);
  check("aborted deploy produced NO redeploy of the healthy target", otherAfter.version === otherBefore.version, `pre/sufix v${otherBefore.version}/${otherAfter.version}`);

  // --- 4. TEST B: target the ACTUALLY stale function -> no more deadlock
  await delay(2500); // real elapsed time must push updated_at past mtime=sec*1000
  r = deployFn(SLUG);
  check("targeting the stale function now deploys (deadlock gone)", r.code === 0 && r.body.includes("Deployed Functions."), `code=${r.code}`);
  check("scoped run exempted + deployed the stale target (revealed as such)", r.body.includes("exempt from this pre-deploy abort: reg-test-gate"));

  const fixed = await settle(SLUG);
  check("fix deploy cleared the staleness (updated_at moved past fabricated mtime)", fixed !== null && fixed.updated_at > mtimeSet, `v${fixed?.version} updated_at=${fixed?.updated_at}`);
  check("verify_jwt preserved on the fix deploy", fixed?.verify_jwt === mine?.verify_jwt);
  check("post-deploy UNSCOPED sweep exits 0 after the fix", run("node scripts/.ops/sweep-shared-staleness.mjs").code === 0);
})().then(async () => {
  await teardown();
  const gone = await pollUntilGone(SLUG);
  const sweep = run("node scripts/.ops/sweep-shared-staleness.mjs");
  check("fleet fully clean after teardown (function deleted, no NEW/STALE leftovers)", gone && sweep.code === 0 && !sweep.body.includes(SLUG), `gone=${gone} code=${sweep.code}`);

  console.log(logs.join("\n"));
  console.log(failures ? "deploy-gate-scope checks FAILED" : "all deploy-gate-scope checks passed");
  process.exitCode = failures ? 1 : 0;
}).catch((e) => {
  console.error("harness internal failure:", e.message);
  process.exitCode = 1;
});