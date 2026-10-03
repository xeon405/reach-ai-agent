// ============================================================================
// What the agent can actually do, described as GOALS rather than word lists.
//
// This is the single source of truth. The prompt is built from it, and the
// model's answer is validated back against it, so a goal can never be invented
// and a write can never be smuggled in under a read's name.
//
// A goal is "what the person is trying to achieve", plus the parts that must be
// filled in. The model matches ANY phrasing to the closest goal; we never try to
// enumerate every phrasing a human might use, because we cannot.
// ============================================================================

export type AgentIntent =
  | "list_campaigns"
  | "campaign_stats"
  | "suggest_targeting"
  | "find_contacts"
  | "add_contacts_to_campaign"
  | "create_campaign_draft"
  | "pause_campaign"
  | "compliance_check"
  | "sender_health";

/** Params are always strings/numbers we can pass straight into a query. */
export type AgentParams = {
  city?: string;
  country?: string;
  company?: string;
  category?: string;
  campaignName?: string;
  query?: string;
  limit?: number;
};

/**
 * Merge newly-learned params over carried-forward ones.
 *
 * A follow-up answer ("Q3 push") supplies ONE slot but should not erase the
 * ones we already had ("city: London"). Later values win, EXCEPT limit, where
 * an explicit new number should replace a default but an absent one must not
 * clobber an earlier explicit choice.
 */
export function mergeParams(carried: AgentParams, fresh: AgentParams): AgentParams {
  const out: AgentParams = { ...carried };
  for (const [k, v] of Object.entries(fresh) as [keyof AgentParams, unknown][]) {
    if (v === undefined || v === null || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export type AgentRequest = {
  intent: AgentIntent;
  params: AgentParams;
  /** Restated in plain words. Shown to the user before a write runs. */
  summary: string;
};

export type Goal = {
  intent: AgentIntent;
  /** Shown to the model. Describe the GOAL, never a list of trigger words. */
  goal: string;
  /** Slots that must be filled before this can run. Missing -> ask. */
  needs: (keyof AgentParams)[];
  /** Phrasings that all mean this. These are EXAMPLES, not a match list. */
  examples: string[];
  /** True if it changes the account. Always needs a human yes. */
  write: boolean;
};

export const GOALS: Goal[] = [
  {
    intent: "suggest_targeting",
    goal: "Recommend who they should actually email, based on the segments already in their own contact data and on who has replied before.",
    needs: [],
    examples: [
      "who should i target",
      "who do i target",
      "what kind of companies should i email",
      "help me pick my audience",
      "which niche is best for me",
      "what should my next campaign target",
    ],
    write: false,
  },
  {
    intent: "list_campaigns",
    goal: "See what campaigns exist and which ones are currently sending.",
    needs: [],
    examples: [
      "what campaigns do I have",
      "show me everything I'm running",
      "is anything going out right now",
      "give me a list of my campaigns",
      "what have I got in the works",
    ],
    write: false,
  },
  {
    intent: "campaign_stats",
    goal:
      "How much has been sent, opened, replied to, or booked. Overall numbers or for one campaign.",
    needs: [],
    examples: [
      "how many emails have I sent",
      "what's my reply rate",
      "how's it been going",
      "give me my numbers",
      "how many meetings have I booked",
    ],
    write: false,
  },
  {
    intent: "find_contacts",
    goal:
      "Search the contacts already saved in the account by city, business name, or what they do.",
    needs: [],
    examples: [
      "find me dentists in Dubai",
      "who do I have in Manchester",
      "do I know any plumbers",
      "show me my saved contacts",
      "anyone I could email in Leeds",
    ],
    write: false,
  },
  {
    intent: "add_contacts_to_campaign",
    goal: "Put matching contacts into an existing campaign so they can be emailed later.",
    needs: ["campaignName"],
    examples: [
      "add the Dubai dentists to Spring Sale",
      "put my Manchester contacts into the new campaign",
      "load everyone in Leeds into Q3 outreach",
    ],
    write: true,
  },
  {
    intent: "create_campaign_draft",
    goal:
      "Create a new campaign. It is always created paused, never sending, and the person starts it themselves.",
    needs: ["campaignName"],
    examples: [
      "start me a new campaign called Spring Sale",
      "I want to run something for dentists",
      "set up a campaign",
      "create something I can add people to later",
    ],
    write: true,
  },
  {
    intent: "pause_campaign",
    goal: "Stop a campaign that is currently sending. Does not delete anything.",
    needs: [],
    examples: [
      "stop that campaign",
      "pause Spring Sale",
      "I don't want these going out any more",
      "turn off what I'm sending",
    ],
    write: true,
  },
  {
    intent: "compliance_check",
    goal: "Who unsubscribed, who is blocked, and who must never be emailed again.",
    needs: [],
    examples: [
      "who unsubscribed",
      "anyone blocked me",
      "who can't I email",
      "am I in trouble with spam complaints",
    ],
    write: false,
  },
  {
    intent: "sender_health",
    goal:
      "Sending reputation, daily sending limit, and warm-up progress. Can also be asked whether the current rate is safe.",
    needs: [],
    examples: [
      "how much can I send today",
      "is my sending rate safe",
      "what's my reputation looking like",
      "am I warmed up yet",
    ],
    write: false,
  },
];

export const VALID_INTENTS = GOALS.map((g) => g.intent);
export const GOAL_BY_INTENT = new Map(GOALS.map((g) => [g.intent, g]));

export function isWriteIntent(intent: string): boolean {
  return GOAL_BY_INTENT.get(intent as AgentIntent)?.write ?? false;
}

/** The slots a goal still needs, given what we already know. */
// Words people use as PLACEHOLDERS for a slot they have not actually named.
// The model sometimes copies them verbatim as the value: "add my London
// dentists to a campaign" became campaignName:"a campaign", which then passed
// the empty check and failed a literal database search with "I could not find
// a campaign called \"a campaign\"" - technically honest, completely useless.
// A slot holding one of these is treated as NOT filled, so the person is asked.
const PLACEHOLDER_SLOTS = new Set([
  "a", "an", "the", "my", "our", "some", "any", "it", "that", "this",
  "campaign", "new", "one", "name", "something", "anything", "next",
]);

export function isPlaceholderSlot(key: keyof AgentParams, v: unknown): boolean {
  if (typeof v !== "string") return false;
  const words = v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  // Only filler counts as a placeholder - a real name must contain a word that
  // is NOT filler, so "Spring Sale" and "my campaign 2024" both survive.
  return words.every((w) => PLACEHOLDER_SLOTS.has(w));
}

export function missingSlots(goal: Goal, params: AgentParams): (keyof AgentParams)[] {
  return goal.needs.filter((k) => {
    const v = params[k];
    if (isPlaceholderSlot(k, v)) return true;
    return v === undefined || v === null || v === "" || (k === "limit" && typeof v !== "number");
  });
}

const SLOT_LABELS: Record<keyof AgentParams, string> = {
  city: "which city",
  country: "which country",
  company: "which business",
  category: "what kind of business",
  campaignName: "which campaign",
  query: "who you're looking for",
  limit: "how many",
};

/** Turns a missing slot into a question a person would actually answer. */
export function slotQuestion(intent: AgentIntent, slots: (keyof AgentParams)[]): string {
  const first = slots[0];
  const label = SLOT_LABELS[first] ?? "a bit more detail";
  return {
    list_campaigns: "Which campaign do you mean?",
    campaign_stats: "Do you want the overall numbers, or for one campaign?",
    suggest_targeting: "Which segment should I look at - a category, city or company?",
    find_contacts: `Sure - ${label}?`,
    add_contacts_to_campaign: `Which campaign should I add them to?`,
    create_campaign_draft: "What should I call the new campaign?",
    pause_campaign: "Which campaign should I pause?",
    compliance_check: "Would you like everyone who unsubscribed, or only blocked contacts?",
    sender_health: "Would you like today's limit, or your overall reputation?",
  }[intent];
}
