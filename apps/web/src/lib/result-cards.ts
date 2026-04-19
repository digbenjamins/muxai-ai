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

export interface ResultCardConfig {
  type: string;
  mapping: Record<string, string>; // slotKey → JSON field name
}

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
  {
    type: "task-decision",
    label: "Task Decision",
    description: "Approval or rejection of a task or proposal",
    slots: [
      { key: "decision", label: "Decision", type: "badge", description: "APPROVE / REJECT / DEFER / ESCALATE" },
      { key: "subject", label: "Subject", type: "subtitle" },
      { key: "priority", label: "Priority", type: "badge", optional: true },
      { key: "reasoning", label: "Reasoning", type: "body" },
      { key: "assigned_to", label: "Assigned To", type: "tag", optional: true },
      { key: "action_items", label: "Action Items", type: "list", optional: true },
    ],
  },
  {
    type: "alert",
    label: "Alert",
    description: "Monitoring or watchdog alert with severity level",
    slots: [
      { key: "severity", label: "Severity", type: "badge", description: "CRITICAL / HIGH / MEDIUM / LOW" },
      { key: "title", label: "Title", type: "title" },
      { key: "source", label: "Source", type: "subtitle", optional: true },
      { key: "message", label: "Message", type: "body" },
      { key: "action_required", label: "Action Required", type: "highlight", optional: true },
    ],
  },
  {
    type: "metric-report",
    label: "Metric Report",
    description: "Key metric with value, trend, and context",
    slots: [
      { key: "metric", label: "Metric Name", type: "title" },
      { key: "value", label: "Value", type: "highlight" },
      { key: "delta", label: "Change", type: "delta", optional: true },
      { key: "period", label: "Period", type: "subtitle", optional: true },
      { key: "status", label: "Status", type: "badge", optional: true },
      { key: "context", label: "Context", type: "body", optional: true },
    ],
  },
  {
    type: "sentiment",
    label: "Sentiment",
    description: "Market or social sentiment with score and direction",
    slots: [
      { key: "asset", label: "Asset", type: "title" },
      { key: "sentiment", label: "Sentiment", type: "badge", description: "BULLISH / BEARISH / NEUTRAL" },
      { key: "score", label: "Score", type: "highlight", optional: true },
      { key: "timeframe", label: "Timeframe", type: "subtitle", optional: true },
      { key: "summary", label: "Summary", type: "body" },
      { key: "key_drivers", label: "Key Drivers", type: "list", optional: true },
    ],
  },
  {
    type: "research-summary",
    label: "Research Summary",
    description: "Analysis or research output with findings and recommendation",
    slots: [
      { key: "title", label: "Title", type: "title" },
      { key: "recommendation", label: "Recommendation", type: "badge", optional: true },
      { key: "confidence", label: "Confidence", type: "badge", optional: true },
      { key: "summary", label: "Summary", type: "body" },
      { key: "key_points", label: "Key Points", type: "list", optional: true },
      { key: "sources", label: "Sources", type: "list", optional: true },
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
