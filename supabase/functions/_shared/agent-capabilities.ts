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
export function missingSlots(goal: Goal, params: AgentParams): (keyof AgentParams)[] {
  return goal.needs.filter((k) => {
    const v = params[k];
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
    find_contacts: `Sure - ${label}?`,
    add_contacts_to_campaign: `Which campaign should I add them to?`,
    create_campaign_draft: "What should I call the new campaign?",
    pause_campaign: "Which campaign should I pause?",
    compliance_check: "Would you like everyone who unsubscribed, or only blocked contacts?",
    sender_health: "Would you like today's limit, or your overall reputation?",
  }[intent];
}
