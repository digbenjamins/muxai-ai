"use client";
import { getCardDefinition, resolveSlot, type ResultCardConfig, type CardSlot } from "@/lib/result-cards";

// ─── Badge color mapping ─────────────────────────────────────────────────────

const POSITIVE = new Set(["LONG", "APPROVE", "BULLISH", "BUY", "HIGH", "SUCCEEDED", "ONLINE", "ACTIVE"]);
const NEGATIVE = new Set(["SHORT", "REJECT", "BEARISH", "SELL", "CRITICAL", "ERROR", "FAILED", "OFFLINE"]);
const NEUTRAL  = new Set(["WAIT", "DEFER", "NEUTRAL", "HOLD", "MEDIUM", "WARNING", "ESCALATE", "PENDING"]);

function getBadgeStyle(value: string) {
  const v = String(value).toUpperCase();
  if (POSITIVE.has(v)) return { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (NEGATIVE.has(v)) return { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" };
  if (NEUTRAL.has(v))  return { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" };
  return { color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" };
}

// ─── Slot renderers ──────────────────────────────────────────────────────────

function BadgePill({ value }: { value: unknown }) {
  if (value == null) return null;
  const s = String(value);
  const { color, bg } = getBadgeStyle(s);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold uppercase tracking-wide ${color} ${bg}`}>
      {s}
    </span>
  );
}

function TagPill({ value }: { value: unknown }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-muted-foreground">
      {String(value)}
    </span>
  );
}

function DeltaValue({ value }: { value: unknown }) {
  if (value == null) return null;
  const s = String(value);
  const isPositive = s.startsWith("+") || (parseFloat(s) > 0 && !s.startsWith("-"));
  const isNegative = s.startsWith("-") || parseFloat(s) < 0;
  return (
    <span className={`text-sm font-mono font-medium ${isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-muted-foreground"}`}>
      {s}
    </span>
  );
}

// ─── Generic card ────────────────────────────────────────────────────────────

export function ResultCard({ config, data }: { config: ResultCardConfig; data: Record<string, unknown> }) {
  const def = getCardDefinition(config.type);
  if (!def) {
    return (
      <pre className="text-xs font-mono text-foreground/80 bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }

  const resolve = (slot: CardSlot) => resolveSlot(slot.key, config.mapping, data);

  const badgeSlots   = def.slots.filter(s => s.type === "badge");
  const titleSlot    = def.slots.find(s => s.type === "title");
  const subtitleSlot = def.slots.find(s => s.type === "subtitle");
  const tagSlots     = def.slots.filter(s => s.type === "tag");
  const highlightSlot = def.slots.find(s => s.type === "highlight");
  const deltaSlot    = def.slots.find(s => s.type === "delta");
  const metricSlots  = def.slots.filter(s => s.type === "metric");
  const bodySlots    = def.slots.filter(s => s.type === "body");
  const listSlots    = def.slots.filter(s => s.type === "list");

  // Card theme driven by primary badge (first badge slot)
  const primaryBadgeValue = badgeSlots[0] ? String(resolve(badgeSlots[0]) ?? "") : "";
  const theme = primaryBadgeValue ? getBadgeStyle(primaryBadgeValue) : { color: "text-muted-foreground", bg: "bg-muted/30 border-border" };

  const hasMetrics = metricSlots.some(s => resolve(s) != null);
  const hasHighlight = highlightSlot && resolve(highlightSlot) != null;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${theme.bg}`}>
      {/* Header: badges + title + subtitle + tags */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {badgeSlots.map(s => {
            const val = resolve(s);
            return val != null ? <BadgePill key={s.key} value={val} /> : null;
          })}
          {titleSlot && resolve(titleSlot) != null && (
            <span className="text-sm font-semibold text-foreground">{String(resolve(titleSlot))}</span>
          )}
          {subtitleSlot && resolve(subtitleSlot) != null && (
            <span className="text-sm text-muted-foreground">{String(resolve(subtitleSlot))}</span>
          )}
          {tagSlots.map(s => {
            const val = resolve(s);
            return val != null ? <TagPill key={s.key} value={val} /> : null;
          })}
        </div>
        {deltaSlot && resolve(deltaSlot) != null && (
          <DeltaValue value={resolve(deltaSlot)} />
        )}
      </div>

      {/* Highlight + metrics grid */}
      {(hasHighlight || hasMetrics) && (
        <div className={`grid gap-3 ${hasHighlight ? "grid-cols-2" : ""}`}>
          {hasHighlight && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{highlightSlot!.label}</p>
              <p className={`text-xl font-mono font-bold ${theme.color}`}>{String(resolve(highlightSlot!))}</p>
            </div>
          )}
          {hasMetrics && (
            <div className={`grid gap-3 ${metricSlots.filter(s => resolve(s) != null).length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
              {metricSlots.map(s => {
                const val = resolve(s);
                if (val == null) return null;
                return (
                  <div key={s.key} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-mono font-medium">{String(val)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Body text sections */}
      {bodySlots.map(s => {
        const val = resolve(s);
        if (val == null) return null;
        return (
          <div key={s.key} className="text-sm">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{s.label} · </span>
            <span className="text-muted-foreground">{String(val)}</span>
          </div>
        );
      })}

      {/* Lists */}
      {listSlots.map(s => {
        const val = resolve(s);
        if (!val || !Array.isArray(val) || val.length === 0) return null;
        return (
          <div key={s.key}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
            <ul className="space-y-0.5">
              {val.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-1.5">
                  <span className={`${theme.color} shrink-0`}>·</span>{String(item)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
