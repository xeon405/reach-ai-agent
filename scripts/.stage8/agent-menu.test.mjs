// The menu is a tree covering the whole product: every sidebar page and every
// intent the executor can run must be reachable from it, and every leaf that
// sends a message must be answerable with ZERO AI calls. A chip the keyword
// router cannot match silently falls through to understand() and costs a call -
// the exact thing the menu exists to avoid.
import { routeIntent } from "../../supabase/functions/_shared/agent-router.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` - ${extra}` : ""}`);
  }
};

// label -> the canonical phrase the frontend sends as `message`.
// Together these MUST cover every intent the executor implements: if a router
// intent is missing here, there is no way to reach it without typing.
const EXPECTED = [
  ["Create new campaign", "create a new campaign", "create_campaign_draft"],
  ["Add leads to a campaign", "add leads to a campaign", "add_contacts_to_campaign"],
  ["Pause a campaign", "pause a campaign", "pause_campaign"],
  ["See my campaigns", "show my campaigns", "list_campaigns"],
  ["Search my saved contacts", "find new contacts", "find_contacts"],
  ["Who should I email?", "who should i email", "suggest_targeting"],
  ["See my results", "show my results", "campaign_stats"],
  ["Sending health", "sender reputation", "sender_health"],
  ["Who's unsubscribed?", "who has unsubscribed", "compliance_check"],
];

const ALL_INTENTS = [
  "campaign_stats",
  "compliance_check",
  "create_campaign_draft",
  "find_contacts",
  "list_campaigns",
  "pause_campaign",
  "sender_health",
  "suggest_targeting",
  "add_contacts_to_campaign",
];

// Pages reachable from the menu instead of a message. /agent is the menu
// itself, so it is the one nav entry that must NOT appear.
const HREFS = [
  "/campaigns",
  "/lead-finder",
  "/leads",
  "/dashboard",
  "/emails",
  "/billing",
  "/settings",
];

const src = await Deno.readTextFile(
  new URL("../../src/routes/_authenticated/agent.tsx", import.meta.url),
);

check("menu is a tree", src.includes("const TREE: MenuNode[]"));

// --- Every message leaf is present in the shipped tree and costs no AI ---
for (const [label, message, intent] of EXPECTED) {
  check(
    `menu contains "${label}"`,
    src.includes(`label: "${label}"`),
    "update EXPECTED if you renamed it",
  );
  check(`menu sends "${message}"`, src.includes(`message: "${message}"`));
  const r = routeIntent(message);
  check(
    `${label} -> ${intent}`,
    r?.intent === intent,
    `got ${r?.intent ?? "null (falls through to AI)"}`,
  );
}

// --- Completeness: nothing reachable in the backend is unreachable here ---
const routed = EXPECTED.map(([, message]) => routeIntent(message)?.intent);
for (const intent of ALL_INTENTS) {
  check(
    `tree can reach ${intent}`,
    routed.includes(intent),
    "add a leaf, or remove it from ALL_INTENTS if it no longer exists",
  );
}
for (const intent of routed) {
  check(`no dead leaf (${intent})`, ALL_INTENTS.includes(intent));
}

// --- Every page in the sidebar is one tap away from the menu ---
const layout = await Deno.readTextFile(
  new URL("../../src/routes/_authenticated.tsx", import.meta.url),
);
const navUrls = [...layout.matchAll(/\burl: "([^"]+)"/g)].map((m) => m[1]);
check("nav array found", navUrls.length > 0);
for (const url of navUrls) {
  if (url === "/agent") continue;
  check(`nav page in menu: ${url}`, src.includes(`href: "${url}"`));
}
for (const href of HREFS) {
  check(`menu link ${href}`, src.includes(`href: "${href}"`));
}

// --- The router must not swallow more specific questions ---
const guards = [
  ["find me dentists in London", "find_contacts"],
  ["who has unsubscribed", "compliance_check"],
  ["sender reputation", "sender_health"],
  ["pause campaign called Spring Sale", "pause_campaign"],
  ["show me my campaigns", "list_campaigns"],
  ["how many emails have I sent", "campaign_stats"],
];
for (const [message, intent] of guards) {
  const r = routeIntent(message);
  check(`guard: "${message}" -> ${intent}`, r?.intent === intent, `got ${r?.intent ?? "null"}`);
}

// suggest_targeting must be reachable (it had no router branch before) but must
// not steal from find_contacts or compliance_check.
check(
  "suggest_targeting reachable",
  routeIntent("who should i email")?.intent === "suggest_targeting",
);
check(
  "suggest not stealing compliance",
  routeIntent("who has unsubscribed")?.intent !== "suggest_targeting",
);

// The menu fast path must run BEFORE understand(), or a click still costs an
// AI call. Static check: the menuHit branch must appear above the understand call.
const idx = await Deno.readTextFile(
  new URL("../../supabase/functions/agent/index.ts", import.meta.url),
);
const menuPos = idx.indexOf("const menuHit");
const understandPos = idx.indexOf("await understand(");
check("menu branch exists", menuPos > 0, "menuHit not found");
check(
  "menu branch precedes understand()",
  menuPos > 0 && understandPos > 0 && menuPos < understandPos,
  `menuPos=${menuPos} understandPos=${understandPos}`,
);
check(
  "menu branch consumes no quota",
  /menuHit[\s\S]{0,400}source = "menu"/.test(idx) &&
    !/consume_ai_quota[\s\S]{0,200}menuHit/.test(idx),
);

console.log(failures === 0 ? "NO FAILURES" : `FAILURES: ${failures}`);
Deno.exit(failures === 0 ? 0 : 1);
