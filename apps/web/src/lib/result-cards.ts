export type SlotType = "badge" | "title" | "subtitle" | "highlight" | "body" | "list" | "metric" | "delta" | "tag";

export interface CardSlot {
  key: string;
  label: string;
  type: SlotType;
  description?: string;
  optional?: boolean;
}

export interface CardDefinition {
  type: string;
  label: string;
  description: string;
  slots: CardSlot[];
}

export interface AutoResolveConfig {
  enabled: boolean;
  exchange?: string;          // default "binance"
  expireBars?: number;        // default 24
  fillTolerancePct?: number;  // default 0.1
}

export interface ResultCardConfig {
  type: string;
  mapping: Record<string, string>; // slotKey → JSON field name
  autoResolve?: AutoResolveConfig; // only meaningful for trade-decision
}

export const AUTO_RESOLVE_DEFAULTS: Required<Omit<AutoResolveConfig, "enabled">> & { enabled: boolean } = {
  enabled: true,
  exchange: "binance",
  expireBars: 24,
  fillTolerancePct: 0.1,
};

export const CARD_TYPES: CardDefinition[] = [
  {
    type: "trade-decision",
    label: "Trade Decision",
    description: "Trading signal with entry, take profit, and stop loss levels",
    slots: [
      { key: "decision", label: "Decision", type: "badge", description: "LONG / SHORT / WAIT" },
      { key: "asset", label: "Asset", type: "subtitle" },
      { key: "timeframe", label: "Timeframe", type: "tag", optional: true },
      { key: "confidence", label: "Confidence", type: "badge", optional: true },
      { key: "entry", label: "Entry", type: "metric", optional: true },
      { key: "take_profit", label: "Take Profit", type: "metric", optional: true },
      { key: "stop_loss", label: "Stop Loss", type: "metric", optional: true },
      { key: "risk_reward", label: "Risk:Reward", type: "metric", optional: true },
      { key: "consensus", label: "Consensus", type: "body", optional: true },
      { key: "invalidation", label: "Invalidation", type: "body", optional: true },
      { key: "watch_for", label: "Watch For", type: "list", optional: true },
      { key: "thesis_evolution", label: "Thesis Evolution", type: "body", optional: true, description: "Reflection on how this decision relates to prior calls" },
      { key: "previous_decisions", label: "Previous Decisions", type: "list", optional: true, description: "One-line summaries of recent prior calls (e.g. '2d ago · WAIT · range unresolved')" },
    ],
  },
];

export function getCardDefinition(type: string): CardDefinition | undefined {
  return CARD_TYPES.find((c) => c.type === type);
}

// Resolve a slot value from data using the mapping (falls back to slot key)
export function resolveSlot(slotKey: string, mapping: Record<string, string>, data: Record<string, unknown>): unknown {
  const fieldName = mapping[slotKey] || slotKey;
  return data[fieldName];
}
