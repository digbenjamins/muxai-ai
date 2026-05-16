"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type CandlestickData,
  type HistogramData,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import {
  PositionBoxPrimitive,
  computeEma,
  toLineData,
  snapToBar,
  intervalToMs,
  type CandleResp,
  type ChartWatch,
} from "@/components/trade-chart";
import { API_URL, API_KEY } from "@/lib/utils";

export interface MultiTrade {
  runId: string;
  side: "LONG" | "SHORT" | "WAIT";
  entry: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  decisionAt: number;        // ms epoch
  hitAt: number | null;
  exitPrice: number | null;
  outcome: "Win" | "Loss" | "NA" | null;
  timeframe: string;
}

interface Props {
  symbol: string;
  interval: string;
  trades: MultiTrade[];
  watches: ChartWatch[];
  selectedRunId?: string | null;
  onTradeSelect?: (runId: string) => void;
  height?: number;
}

// Combined chart for one asset — overlays every trade's position box, decision
// marker, and exit marker plus all dashed watch lines. Lets the trade-decisions
// page show a "TradingView style" view of all activity on a pair at once.
export function MultiTradeChart({
  symbol,
  interval,
  trades,
  watches,
  selectedRunId,
  onTradeSelect,
  height = 640,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const watchLinesRef = useRef<IPriceLine[]>([]);
  const boxesRef = useRef<PositionBoxPrimitive[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Position of the right-click context menu (TradingView-style). null = closed.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Re-fits the visible range to span every trade decision + exit, plus padding.
  // Same logic as the initial load, exposed so the right-click menu can reset.
  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (trades.length === 0) { chart.timeScale().fitContent(); return; }
    const intervalMs = intervalToMs(interval);
    const earliest = Math.min(...trades.map((t) => Math.floor(t.decisionAt / 1000)));
    const latestActivity = Math.max(
      ...trades.map((t) => Math.floor((t.hitAt ?? t.decisionAt) / 1000)),
    );
    const padSec = Math.floor((intervalMs / 1000) * 30);
    chart.timeScale().setVisibleRange({
      from: (earliest - padSec) as UTCTimestamp,
      to: (latestActivity + padSec) as UTCTimestamp,
    });
  }, [trades, interval]);

  // Close the context menu on any outside click or Escape press.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  // ── Init chart + all series once ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(148, 163, 184, 0.9)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        panes: { separatorColor: "rgba(148, 163, 184, 0.15)", separatorHoverColor: "rgba(148, 163, 184, 0.3)", enableResize: true },
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.15)" },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });
    const ema20 = chart.addSeries(LineSeries, { color: "rgba(96, 165, 250, 0.85)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ema50 = chart.addSeries(LineSeries, { color: "rgba(251, 146, 60, 0.85)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const ema200 = chart.addSeries(LineSeries, { color: "rgba(168, 85, 247, 0.9)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    }, 1);

    chartRef.current = chart;
    seriesRef.current = candles;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;
    ema200Ref.current = ema200;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      volumeRef.current = null;
      watchLinesRef.current = [];
      boxesRef.current = [];
      markersRef.current = null;
    };
  }, []);

  // ── Marker click → trade selection ───────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onTradeSelect) return;
    const handler = (param: { time?: Time }) => {
      if (param.time == null) return;
      const tSec = typeof param.time === "number" ? param.time : null;
      if (tSec === null) return;
      let best: MultiTrade | null = null;
      let bestDist = Infinity;
      for (const t of trades) {
        const dSec = Math.floor(t.decisionAt / 1000);
        const d = Math.abs(dSec - tSec);
        if (d < bestDist) { bestDist = d; best = t; }
      }
      // Tolerance: within ~2 bars of the click.
      const tolBars = (intervalToMs(interval) / 1000) * 2;
      if (best && bestDist <= tolBars) onTradeSelect(best.runId);
    };
    chart.subscribeClick(handler);
    return () => { chart.unsubscribeClick(handler); };
  }, [trades, interval, onTradeSelect]);

  // ── Load + redraw on input change ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const chart = chartRef.current;
      const candles = seriesRef.current;
      const ema20 = ema20Ref.current;
      const ema50 = ema50Ref.current;
      const ema200 = ema200Ref.current;
      const volume = volumeRef.current;
      if (!chart || !candles || !ema20 || !ema50 || !ema200 || !volume) return;
      setError(null);
      setLoading(true);

      const intervalMs = intervalToMs(interval);

      // Pull a wide pre-trade history (~500 bars) so candle density matches the
      // single-trade chart. Adapt the pre-padding so the API's 1000-candle cap
      // still reaches every trade's exit.
      let since: number;
      if (trades.length === 0) {
        since = Date.now() - intervalMs * 1000;
      } else {
        const earliest = Math.min(...trades.map((t) => t.decisionAt));
        const latestActivity = Math.max(
          ...trades.map((t) => t.hitAt ?? t.decisionAt),
          Date.now(),
        );
        const spanBars = Math.floor((latestActivity - earliest) / intervalMs);
        const maxPreBars = Math.max(50, 1000 - spanBars - 50);
        const preBars = Math.min(500, maxPreBars);
        since = earliest - intervalMs * preBars;
      }

      try {
        const url = `${API_URL}/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&since=${since}&limit=1000`;
        const res = await fetch(url, { headers: API_KEY ? { "X-Api-Key": API_KEY } : {} });
        if (!res.ok) throw new Error(`Candles ${res.status}`);
        const body = (await res.json()) as CandleResp;
        if (cancelled) return;

        const data: CandlestickData[] = body.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open, high: c.high, low: c.low, close: c.close,
        }));
        candles.setData(data);

        const closes = body.candles.map((c) => c.close);
        ema20.setData(toLineData(body.candles, computeEma(closes, 20)));
        ema50.setData(toLineData(body.candles, computeEma(closes, 50)));
        ema200.setData(toLineData(body.candles, computeEma(closes, 200)));

        const volData: HistogramData[] = body.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
        }));
        volume.setData(volData);

        // Position boxes — one per LONG/SHORT trade with concrete levels.
        for (const box of boxesRef.current) candles.detachPrimitive(box);
        boxesRef.current = [];
        const lastTime = data.length ? (data[data.length - 1].time as UTCTimestamp) : (Math.floor(Date.now() / 1000) as UTCTimestamp);

        const markers: SeriesMarker<Time>[] = [];
        for (const t of trades) {
          const decisionTime = snapToBar(body.candles, t.decisionAt);
          const exitTime = (t.hitAt ? snapToBar(body.candles, t.hitAt) : lastTime) as UTCTimestamp;
          const hasLevels =
            t.side !== "WAIT" &&
            typeof t.entry === "number" &&
            typeof t.takeProfit === "number" &&
            typeof t.stopLoss === "number";
          if (hasLevels) {
            const box = new PositionBoxPrimitive({
              decisionTime,
              exitTime,
              entry: t.entry!,
              takeProfit: t.takeProfit!,
              stopLoss: t.stopLoss!,
            });
            candles.attachPrimitive(box);
            boxesRef.current.push(box);
          }

          markers.push(
            t.side === "WAIT"
              ? { time: decisionTime, position: "aboveBar", color: "#f59e0b", shape: "circle", text: "WAIT" }
              : {
                  time: decisionTime,
                  position: t.side === "LONG" ? "belowBar" : "aboveBar",
                  color: t.runId === selectedRunId ? "#facc15" : "#94a3b8",
                  shape: t.side === "LONG" ? "arrowUp" : "arrowDown",
                  text: t.side,
                },
          );

          if (t.side !== "WAIT" && t.hitAt && t.exitPrice !== null && t.exitPrice !== undefined) {
            const win = t.outcome === "Win";
            markers.push({
              time: Math.floor(t.hitAt / 1000) as UTCTimestamp,
              position: win ? "aboveBar" : "belowBar",
              color: win ? "#10b981" : t.outcome === "Loss" ? "#ef4444" : "#94a3b8",
              shape: win ? "arrowDown" : "arrowUp",
              text: `${t.outcome ?? "EXIT"} @ ${t.exitPrice}`,
            });
          }
        }
        // Sort markers by time — lightweight-charts requires non-decreasing time.
        markers.sort((a, b) => Number(a.time) - Number(b.time));
        if (markersRef.current) markersRef.current.setMarkers(markers);
        else markersRef.current = createSeriesMarkers(candles as ISeriesApi<SeriesType, Time>, markers);

        // Fit visible range to span all trade activity, plus 30 bars padding.
        if (trades.length > 0 && data.length > 0) {
          const earliest = Math.min(...trades.map((t) => Math.floor(t.decisionAt / 1000)));
          const latestActivity = Math.max(
            ...trades.map((t) => Math.floor((t.hitAt ?? t.decisionAt) / 1000)),
          );
          const padSec = Math.floor((intervalMs / 1000) * 30);
          const firstBar = Number(data[0].time);
          const lastBar = Number(data[data.length - 1].time);
          const from = Math.max(earliest - padSec, firstBar) as UTCTimestamp;
          const to = Math.min(latestActivity + padSec, lastBar) as UTCTimestamp;
          if (from < to) chart.timeScale().setVisibleRange({ from, to });
          else chart.timeScale().fitContent();
        } else {
          chart.timeScale().fitContent();
        }

        const panes = chart.panes();
        if (panes.length > 1) panes[1].setHeight(90);

        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load candles");
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [symbol, interval, trades, selectedRunId]);

  // Watch lines redraw on their own so toggling a notification doesn't reload candles.
  useEffect(() => {
    const candles = seriesRef.current;
    if (!candles) return;
    for (const pl of watchLinesRef.current) candles.removePriceLine(pl);
    watchLinesRef.current = [];
    if (!watches || watches.length === 0) return;
    for (const w of watches) {
      const triggered = w.status === "triggered";
      const arrow = w.direction === "above" ? "▲" : "▼";
      watchLinesRef.current.push(
        candles.createPriceLine({
          price: w.price,
          color: triggered ? "rgba(16, 185, 129, 0.65)" : "rgba(251, 191, 36, 0.85)",
          lineWidth: 1,
          lineStyle: triggered ? LineStyle.Solid : LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `${arrow} ${w.price}`,
        }),
      );
    }
  }, [watches]);

  return (
    <div
      className="relative"
      style={{ height }}
      onContextMenu={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
          loading candles…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="absolute top-1.5 left-2 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/80 pointer-events-none">
        <LegendDot color="rgba(96, 165, 250, 0.85)" label="EMA 20" />
        <LegendDot color="rgba(251, 146, 60, 0.85)" label="EMA 50" />
        <LegendDot color="rgba(168, 85, 247, 0.9)" label="EMA 200" />
      </div>
      {ctxMenu && (
        <div
          className="absolute z-50 min-w-[180px] rounded-md border border-border bg-popover shadow-lg py-1 text-xs font-mono"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <ContextMenuItem
            label="Reset view"
            hint="fit all trades"
            onClick={() => { resetView(); setCtxMenu(null); }}
          />
          <ContextMenuItem
            label="Fit all candles"
            hint="zoom out to loaded data"
            onClick={() => { chartRef.current?.timeScale().fitContent(); setCtxMenu(null); }}
          />
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 hover:bg-foreground/[0.06] flex items-center justify-between gap-3"
    >
      <span className="text-foreground">{label}</span>
      {hint && <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{hint}</span>}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-0.5 w-3" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}
