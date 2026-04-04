// Rotating greeting phrases for Winston's empty-state and composer placeholder.
// Butler/concierge personality — competent, discreet, slightly elevated.
// Not theatrical. "Private office operator who gets things done."

type GreetingCategory = "core" | "elevated" | "contextual" | "concierge";

interface Greeting {
  text: string;
  category: GreetingCategory;
}

const GREETINGS: Greeting[] = [
  // Core (60% weight)
  { text: "How may I be of service?", category: "core" },
  { text: "What can I take care of for you?", category: "core" },
  { text: "How can I assist?", category: "core" },
  { text: "What would you like handled?", category: "core" },
  { text: "How can I help move this forward?", category: "core" },
  { text: "What do you need from me?", category: "core" },
  { text: "How can I support you here?", category: "core" },
  { text: "What should we work on?", category: "core" },
  { text: "What would you like done?", category: "core" },
  { text: "How can I help you right now?", category: "core" },

  // Elevated (25% weight)
  { text: "What can I take off your plate?", category: "elevated" },
  { text: "How can I make this easier?", category: "elevated" },
  { text: "What would you like me to handle next?", category: "elevated" },
  { text: "Where should I focus?", category: "elevated" },
  { text: "What's the priority?", category: "elevated" },
  { text: "What needs attention?", category: "elevated" },
  { text: "What would you like resolved?", category: "elevated" },
  { text: "How can I help you make progress here?", category: "elevated" },
  { text: "What can I streamline for you?", category: "elevated" },
  { text: "What are we tackling?", category: "elevated" },
  { text: "What should I look into?", category: "elevated" },
  { text: "Want me to dig into anything here?", category: "elevated" },
  { text: "What would you like analyzed?", category: "elevated" },
  { text: "Should I run this down?", category: "elevated" },
  { text: "Want a breakdown or quick answer?", category: "elevated" },

  // Contextual (10% weight)
  { text: "What would you like to know about this?", category: "contextual" },
  { text: "What needs a closer look?", category: "contextual" },
  { text: "Should I pull details on this?", category: "contextual" },
  { text: "What are you trying to figure out?", category: "contextual" },
  { text: "Where do you want clarity?", category: "contextual" },
  { text: "What should I execute?", category: "contextual" },
  { text: "What would you like me to run?", category: "contextual" },
  { text: "What can I process for you?", category: "contextual" },
  { text: "What needs to get done?", category: "contextual" },
  { text: "What are we doing here?", category: "contextual" },

  // Concierge (5% weight)
  { text: "At your service — what do you need?", category: "concierge" },
  { text: "Just say the word.", category: "concierge" },
  { text: "I'm ready — how can I help?", category: "concierge" },
  { text: "What can I handle on your behalf?", category: "concierge" },
  { text: "How may I assist you?", category: "concierge" },
  { text: "I'm here — what do you need?", category: "concierge" },
  { text: "How can I be useful?", category: "concierge" },
  { text: "What can I do for you?", category: "concierge" },
  { text: "Ready when you are — what's next?", category: "concierge" },
  { text: "Point me where to act.", category: "concierge" },
];

// Page-type signals that unlock a context-aware phrase override
const CONTEXT_OVERRIDES: { pattern: RegExp; greeting: string }[] = [
  { pattern: /resume|profile|bio|career/i, greeting: "What would you like to know about this?" },
  { pattern: /deal|asset|property|pipeline/i, greeting: "What should I run?" },
  { pattern: /dashboard|report|analytics|chart|data|metric|performance/i, greeting: "What would you like analyzed?" },
  { pattern: /model|scenario|assumption|irr|tvpi|return/i, greeting: "What would you like me to run?" },
  { pattern: /fund|investor|lp|capital/i, greeting: "What should I look into?" },
];

// Weighted random picker: core=6, elevated=2.5, contextual=1, concierge=0.5
const CATEGORY_WEIGHTS: Record<GreetingCategory, number> = {
  core: 6,
  elevated: 2.5,
  contextual: 1,
  concierge: 0.5,
};

function weightedRandom(greetings: Greeting[]): string {
  const totalWeight = greetings.reduce((sum, g) => sum + CATEGORY_WEIGHTS[g.category], 0);
  let rand = Math.random() * totalWeight;
  for (const g of greetings) {
    rand -= CATEGORY_WEIGHTS[g.category];
    if (rand <= 0) return g.text;
  }
  return greetings[0]?.text ?? "How may I be of service?";
}

/**
 * Returns a greeting phrase for Winston's empty state.
 * Silently respects page context to pick thematically appropriate phrasing.
 * Never exposes routing or context to the user.
 */
export function getGreeting(routeLabel?: string, scopeLabel?: string): string {
  const signal = `${routeLabel ?? ""} ${scopeLabel ?? ""}`;

  for (const override of CONTEXT_OVERRIDES) {
    if (override.pattern.test(signal)) {
      return override.greeting;
    }
  }

  return weightedRandom(GREETINGS);
}
