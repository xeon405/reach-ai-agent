// ============================================================
// AGENT CONFIG — config-driven judgment for inbox-agent (0b).
// Reads per-invocation: glob -> user -> campaign (most specific wins).
// Emergency default: the compile-time constants below are used when the
// read errors or no rows exist. Judgment knobs are ONLY set by config rows,
// never invented by code or prompts.
// ============================================================

export interface AgentConfig {
  confidence_floor: number;
  turn_budget: number;
  reply_policy: string;
  max_ai_replies_per_lead_24h: number;
}

export const AGENT_CONFIG_KEYS = [
  "confidence_floor",
  "turn_budget",
  "reply_policy",
  "max_ai_replies_per_lead_24h",
] as const;

/** Today's hardcoded inbox-agent constants — the emergency default. */
export const AGENT_CONFIG_DEFAULTS: AgentConfig = {
  confidence_floor: 0.55,
  turn_budget: 3,
  reply_policy: "balanced",
  max_ai_replies_per_lead_24h: 5,
};

const REPLY_POLICIES = new Set(["balanced", "concise", "thorough", "cautious"]);

/**
 * Extra drafting-guidance suffix a reply policy injects into the composing
 * prompts. "balanced" adds nothing, so default-config prompts are byte-identical
 * to today's. Used by inbox-agent's drafting paths.
 */
const REPLY_POLICY_GUIDES: Record<string, string> = {
  balanced: "",
  concise: " Keep it to 1-2 short sentences — no fluff or pleasantries beyond the sign-off.",
  thorough: " Be thorough and helpful: fully answer their point from the knowledge base, up to 4-5 sentences.",
  cautious: " Be conservative: answer strictly what they asked — never volunteer offers or next steps unless they ask.",
};

export function replyPolicySuffix(policy: string): string {
  return REPLY_POLICY_GUIDES[policy] ?? "";
}

/**
 * Scoped capability switch (e.g. `memory_builder.enabled`). Same convention as
 * the ai_quality gate markers: most-specific-wins (campaign > user > glob),
 * enabled rows only. Default TRUE when absent or unreadable (fails open, matching
 * resolveAgentConfig's emergency-default convention — a capability switch is an
 * availability control, not a security boundary; the content governance backstop
 * for memory writing never disables on failure). Each capability gets its own
 * switch; call sites read only the key they own.
 */
export async function resolveScopedSwitch(
  db: Db,
  key: string,
  scope: { userId?: string | null; campaignId?: string | null },
): Promise<boolean> {
  try {
    const { data } = await db
      .from("agent_config")
      .select("key, scope, scope_id, value, enabled")
      .in("key", [key])
      .eq("enabled", true);
    const rows = (data ?? []) as Array<{ key: string; scope: string; scope_id: string | null; value: unknown }>;
    const eff = (scope.campaignId ? rows.find((r) => r.key === key && r.scope === "campaign" && r.scope_id === scope.campaignId) : undefined)
      ?? (scope.userId ? rows.find((r) => r.key === key && r.scope === "user" && r.scope_id === scope.userId) : undefined)
      ?? rows.find((r) => r.key === key && r.scope === "glob" && r.scope_id === null);
    if (eff == null) return true;
    return eff.value === true || eff.value === "true" || eff.value === 1 || eff.value === "1";
  } catch {
    return true;
  }
}

function clampNumber(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  return Math.round(clampNumber(v, lo, hi, dflt));
}

// Structural supabase client — no runtime dependency, pure helper.
type Db = { from: (table: string) => any };

/**
 * Resolve effective config for one (userId, campaignId) pair.
 * Order per key: glob -> user -> campaign. A disabled row is ignored.
 * Any read failure → pure defaults (emergency = today's constants).
 */
export async function resolveAgentConfig(
  db: Db,
  scope: { userId?: string | null; campaignId?: string | null },
): Promise<AgentConfig> {
  const out: AgentConfig = { ...AGENT_CONFIG_DEFAULTS };
  let entries: Array<{ key: string; scope: string; scope_id: string | null; value: unknown }> = [];
  try {
    const { data } = await db
      .from("agent_config")
      .select("key, scope, scope_id, value")
      .eq("enabled", true)
      .in("key", [...AGENT_CONFIG_KEYS]);
    entries = (data ?? []) as typeof entries;
  } catch {
    return out; // emergency default — no opinion, behave exactly as today
  }

  const base = {
    glob: [] as typeof entries,
    user: [] as typeof entries,
    campaign: [] as typeof entries,
  };
  for (const row of entries) {
    if (row.scope === "glob") base.glob.push(row);
    else if (row.scope === "user" && row.scope_id === scope.userId) base.user.push(row);
    else if (row.scope === "campaign" && row.scope_id === scope.campaignId) base.campaign.push(row);
  }

  const apply = (row: (typeof entries)[number]) => {
    switch (row.key) {
      case "confidence_floor":
        out.confidence_floor = clampNumber(row.value, 0, 1, out.confidence_floor);
        break;
      case "turn_budget":
        out.turn_budget = clampInt(row.value, 1, 10, out.turn_budget);
        break;
      case "reply_policy": {
        const v = typeof row.value === "string" ? row.value : "";
        if (REPLY_POLICIES.has(v)) out.reply_policy = v;
        break;
      }
      case "max_ai_replies_per_lead_24h":
        out.max_ai_replies_per_lead_24h = clampInt(row.value, 1, 20, out.max_ai_replies_per_lead_24h);
        break;
    }
  };

  for (const r of base.glob) apply(r);
  for (const r of base.user) apply(r);
  for (const r of base.campaign) apply(r);
  return out;
}