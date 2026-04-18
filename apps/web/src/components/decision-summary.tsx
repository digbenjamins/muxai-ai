import { getCardDefinition, resolveSlot, type ResultCardConfig } from "@/lib/result-cards";

const POSITIVE = new Set(["LONG", "APPROVE", "BULLISH", "BUY", "HIGH", "SUCCEEDED", "ONLINE", "ACTIVE"]);
const NEGATIVE = new Set(["SHORT", "REJECT", "BEARISH", "SELL", "CRITICAL", "ERROR", "FAILED", "OFFLINE"]);
const NEUTRAL  = new Set(["WAIT", "DEFER", "NEUTRAL", "HOLD", "MEDIUM", "WARNING", "ESCALATE", "PENDING"]);

function badgeClass(value: string): string {
  const v = value.toUpperCase();
  if (POSITIVE.has(v)) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  if (NEGATIVE.has(v)) return "text-red-300 bg-red-500/15 border-red-500/30";
  if (NEUTRAL.has(v))  return "text-amber-300 bg-amber-500/15 border-amber-500/30";
  return "text-slate-300 bg-slate-500/15 border-slate-500/30";
}

export function DecisionSummary({
  resultJson,
  cardConfig,
}: {
  resultJson: Record<string, unknown>;
  cardConfig?: ResultCardConfig;
}) {
  const def = cardConfig && cardConfig.type !== "none" && cardConfig.type !== "raw"
    ? getCardDefinition(cardConfig.type)
    : undefined;

  // Fallback: no card config — show first string/number field
  if (!def || !cardConfig) {
    const firstPair = Object.entries(resultJson).find(([, v]) => typeof v === "string" || typeof v === "number");
    if (!firstPair) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/60">{firstPair[0]}:</span>
        <span className="font-medium text-foreground/85">{String(firstPair[1])}</span>
      </span>
    );
  }

  const resolve = (slotKey: string) => resolveSlot(slotKey, cardConfig.mapping, resultJson);

  const badgeSlot = def.slots.find((s) => s.type === "badge");
  const titleSlot = def.slots.find((s) => s.type === "title");
  const subtitleSlot = def.slots.find((s) => s.type === "subtitle");
  const firstTagSlot = def.slots.find((s) => s.type === "tag");

  const badgeVal   = badgeSlot ? resolve(badgeSlot.key) : null;
  const titleVal   = titleSlot ? resolve(titleSlot.key) : null;
  const subtitleVal = subtitleSlot ? resolve(subtitleSlot.key) : null;
  const tagVal     = firstTagSlot ? resolve(firstTagSlot.key) : null;

  if (badgeVal == null && titleVal == null && subtitleVal == null) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      {badgeVal != null && (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${badgeClass(String(badgeVal))}`}>
          {String(badgeVal)}
        </span>
      )}
      {titleVal != null && <span className="font-medium text-foreground/90">{String(titleVal)}</span>}
      {subtitleVal != null && <span className="text-muted-foreground">{String(subtitleVal)}</span>}
      {tagVal != null && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          {String(tagVal)}
        </span>
      )}
    </span>
  );
}
