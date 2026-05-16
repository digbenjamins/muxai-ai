"use client";
import { useMemo, useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { MultiTradeChart, type MultiTrade } from "@/components/multi-trade-chart";
import type { PriceWatch } from "@/components/watch-for-list";

export interface ChartTrade {
  runId: string;
  asset: string;       // pretty label e.g. "BTC/USDT"
  symbol: string;      // normalized e.g. "BTCUSDT"
  timeframe: string;
  side: "LONG" | "SHORT" | "WAIT";
  entry: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  decisionAt: number | null;
  hitAt: number | null;
  exitPrice: number | null;
  outcome: string | null;
  createdAt: string;
  resolutionStatus: "pending" | "active" | "resolved" | "expired" | string | null;
}

const TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d"] as const;
type Timeframe = typeof TIMEFRAMES[number];

interface Props {
  trades: ChartTrade[];
  watches: PriceWatch[];
  onTradeSelect?: (runId: string) => void;
}

// Full-page combined chart for the trade-decisions terminal. Groups every trade
// by asset, lets the user tab between pairs, and overlays all position boxes +
// markers + active watch lines onto a single chart per pair.
export function ChartsView({ trades, watches, onTradeSelect }: Props) {
  const groups = useMemo(() => groupBySymbol(trades), [trades]);
  const symbols = groups.map((g) => g.symbol);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(symbols[0] ?? null);
  const [intervalSel, setIntervalSel] = useState<Timeframe>("4h");

  useEffect(() => {
    if (!selectedSymbol && symbols.length > 0) setSelectedSymbol(symbols[0]);
    if (selectedSymbol && !symbols.includes(selectedSymbol)) setSelectedSymbol(symbols[0] ?? null);
  }, [symbols, selectedSymbol]);

  const selectedGroup = groups.find((g) => g.symbol === selectedSymbol) ?? null;

  // Pick the most-traded timeframe on the selected asset the first time we land
  // on it — beats forcing 4h if the lead trades that pair on 1h.
  useEffect(() => {
    if (!selectedGroup) return;
    const counts = new Map<string, number>();
    for (const t of selectedGroup.trades) {
      counts.set(t.timeframe, (counts.get(t.timeframe) ?? 0) + 1);
    }
    let best: Timeframe | null = null;
    let bestCount = 0;
    for (const tf of TIMEFRAMES) {
      const c = counts.get(tf) ?? 0;
      if (c > bestCount) { best = tf; bestCount = c; }
    }
    if (best) setIntervalSel(best);
  }, [selectedGroup?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedGroup) {
    return (
      <div className="rounded-lg border border-dashed border-border h-[480px] flex items-center justify-center text-xs text-muted-foreground">
        No trade decisions to chart yet.
      </div>
    );
  }

  const symbolWatches = watches.filter(
    (w) => w.symbol.toUpperCase().replace(/[\/\-_\s]/g, "") === selectedGroup.symbol,
  );

  const multiTrades: MultiTrade[] = selectedGroup.trades
    .filter((t) => t.decisionAt !== null)
    .map((t) => ({
      runId: t.runId,
      side: t.side,
      entry: t.entry,
      takeProfit: t.takeProfit,
      stopLoss: t.stopLoss,
      decisionAt: t.decisionAt!,
      hitAt: t.hitAt,
      exitPrice: t.exitPrice,
      outcome: (t.outcome === "Win" || t.outcome === "Loss" || t.outcome === "NA")
        ? t.outcome as "Win" | "Loss" | "NA"
        : null,
      timeframe: t.timeframe,
    }));

  const chartWatches = symbolWatches.map((w) => ({
    price: w.price,
    label: w.label,
    status: w.status,
    direction: w.direction,
  }));

  const activeCount = selectedGroup.trades.filter(
    (t) => t.resolutionStatus === "pending" || t.resolutionStatus === "active",
  ).length;
  const watchCount = symbolWatches.filter((w) => w.status === "active").length;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto">
            {groups.map((g) => {
              const active = g.symbol === selectedSymbol;
              const open = g.trades.filter((t) => t.resolutionStatus === "pending" || t.resolutionStatus === "active").length;
              return (
                <button
                  key={g.symbol}
                  onClick={() => setSelectedSymbol(g.symbol)}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-mono transition-colors flex items-center gap-1.5 ${
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                  }`}
                >
                  <span className="font-semibold">{g.asset}</span>
                  <span className="text-[10px] text-muted-foreground/70">{g.trades.length}</span>
                  {open > 0 && (
                    <span className="text-[10px] text-amber-400">·{open}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span>{selectedGroup.trades.length} runs</span>
              {activeCount > 0 && <span className="text-amber-400">{activeCount} active</span>}
              {watchCount > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <Bell className="h-3 w-3" /> {watchCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setIntervalSel(tf)}
                  className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
                    intervalSel === tf ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-2 py-2">
          <MultiTradeChart
            symbol={selectedGroup.symbol}
            interval={intervalSel}
            trades={multiTrades}
            watches={chartWatches}
            onTradeSelect={onTradeSelect}
            height={640}
          />
        </div>
      </div>
    </div>
  );
}

interface SymbolGroup {
  symbol: string;
  asset: string;
  trades: ChartTrade[];
  latestAt: number;
}

function groupBySymbol(trades: ChartTrade[]): SymbolGroup[] {
  const map = new Map<string, SymbolGroup>();
  for (const t of trades) {
    if (!t.symbol || t.decisionAt === null) continue;
    const at = t.decisionAt ?? new Date(t.createdAt).getTime();
    const existing = map.get(t.symbol);
    if (existing) {
      existing.trades.push(t);
      if (at > existing.latestAt) existing.latestAt = at;
    } else {
      map.set(t.symbol, { symbol: t.symbol, asset: t.asset, trades: [t], latestAt: at });
    }
  }
  // Sort assets by most recent activity first.
  return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
}
