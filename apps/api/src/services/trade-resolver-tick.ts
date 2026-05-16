// Trade-resolver background tick. Runs every TICK_MS and resolves any
// open trade-decision runs against fresh exchange candles.

import { prisma } from "../lib/db";
import { resolveTradeFromCandles, type Candle, type TradeSide } from "./trade-resolver";
import { reportTick } from "./scheduler-registry";
import { getCandles, intervalToMs, normalizeSymbol } from "./candle-cache";
import { processWatchesForSymbol } from "./watch-checker";

const TICK_MS = 60_000;
const SCHEDULER_ID = "trade-resolver";
const SCHEDULER_LABEL = "Trade Resolver";
const SCHEDULER_SCHEDULE = "60s";

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

interface AutoResolveCfg {
  enabled?: boolean;
  exchange?: string;
  expireBars?: number;
  fillTolerancePct?: number;
}

interface ResultCardCfg {
  type?: string;
  mapping?: Record<string, string>;
  autoResolve?: AutoResolveCfg;
}

const DEFAULT_EXPIRE_BARS = 24;
const DEFAULT_TOLERANCE = 0.1;
const DEFAULT_EXCHANGE = "binance";

function getCardCfg(adapterConfig: unknown): ResultCardCfg | null {
  if (!adapterConfig || typeof adapterConfig !== "object") return null;
  const card = (adapterConfig as Record<string, unknown>).resultCard;
  if (!card || typeof card !== "object") return null;
  return card as ResultCardCfg;
}

function getMappedField(mapping: Record<string, string> | undefined, slotKey: string): string {
  return mapping?.[slotKey]?.trim() || slotKey;
}

function readNumber(json: Record<string, unknown>, key: string): number | null {
  const v = json[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readSide(json: Record<string, unknown>, key: string): TradeSide | "WAIT" | null {
  const v = json[key];
  if (typeof v !== "string") return null;
  const norm = v.trim().toUpperCase();
  if (norm === "LONG" || norm === "SHORT" || norm === "WAIT") return norm;
  return null;
}

interface OpenTrade {
  runId: string;
  agentId: string;
  // WAIT decisions ride along in the same fetch groups so the candle cache
  // stays warm for their (symbol, timeframe). They have no entry/TP/SL and
  // are skipped by the per-trade resolver call.
  side: TradeSide | "WAIT";
  entry: number;
  takeProfit: number;
  stopLoss: number;
  decisionAt: number;
  asset: string;
  timeframe: string;
  exchange: string;
  expireBars: number;
  fillTolerancePct: number;
  resolutionStatus: string | null;
  resolutionMeta: Record<string, unknown> | null;
  manualEntry?: { at: number; fill: number };
  manualExit?: { at: number; price: number };
}

function readManualEntry(meta: Record<string, unknown> | null): { at: number; fill: number } | undefined {
  const m = meta?.manualEntry;
  if (!m || typeof m !== "object") return undefined;
  const obj = m as Record<string, unknown>;
  const at = typeof obj.at === "number" ? obj.at : null;
  const fill = typeof obj.fill === "number" ? obj.fill : null;
  if (at === null || fill === null) return undefined;
  return { at, fill };
}

function readManualExit(meta: Record<string, unknown> | null): { at: number; price: number } | undefined {
  const m = meta?.manualExit;
  if (!m || typeof m !== "object") return undefined;
  const obj = m as Record<string, unknown>;
  const at = typeof obj.at === "number" ? obj.at : null;
  const price = typeof obj.price === "number" ? obj.price : null;
  if (at === null || price === null) return undefined;
  return { at, price };
}

async function findOpenTrades(): Promise<OpenTrade[]> {
  // Pull candidate runs whose resolution is incomplete and whose agent uses
  // a trade-decision card. Filtering on JSON inside Postgres is awkward via
  // Prisma; we filter app-side which is fine at the volumes muxAI runs at.
  const rows = await prisma.heartbeatRun.findMany({
    where: {
      OR: [{ resolutionStatus: null }, { resolutionStatus: { in: ["pending", "active"] } }],
      resultJson: { not: undefined },
      finishedAt: { not: null },
    },
    select: {
      id: true,
      agentId: true,
      finishedAt: true,
      resultJson: true,
      resolutionStatus: true,
      resolutionMeta: true,
      agent: { select: { adapterConfig: true } },
    },
    orderBy: { finishedAt: "desc" },
    take: 200,
  });

  const now = Date.now();
  const out: OpenTrade[] = [];
  for (const r of rows) {
    const card = getCardCfg(r.agent?.adapterConfig);
    if (!card || card.type !== "trade-decision") continue;
    const auto = card.autoResolve;
    if (auto?.enabled === false) continue;

    const result = r.resultJson as Record<string, unknown> | null;
    if (!result || typeof result !== "object") continue;
    const mapping = card.mapping;
    const decisionKey = getMappedField(mapping, "decision");
    const side = readSide(result, decisionKey);
    if (!side) continue;

    const asset = (result[getMappedField(mapping, "asset")] as string | undefined) ?? null;
    const timeframe = (result[getMappedField(mapping, "timeframe")] as string | undefined) ?? "4h";
    if (!asset || typeof asset !== "string") continue;

    const expireBars = auto?.expireBars || DEFAULT_EXPIRE_BARS;
    const decisionAt = r.finishedAt!.getTime();

    if (side === "WAIT") {
      // WAIT decisions don't resolve, but we keep their candles warm so the
      // chart is instant for the user reviewing watch_for/invalidation. Drop
      // anything older than the expiry window so the cache load stays bounded.
      const intervalMs = intervalToMs(timeframe);
      if (!intervalMs) continue;
      if (now - decisionAt > expireBars * intervalMs) continue;
      out.push({
        runId: r.id,
        agentId: r.agentId,
        side: "WAIT",
        entry: 0,
        takeProfit: 0,
        stopLoss: 0,
        decisionAt,
        asset,
        timeframe,
        exchange: auto?.exchange || DEFAULT_EXCHANGE,
        expireBars,
        fillTolerancePct: typeof auto?.fillTolerancePct === "number" ? auto.fillTolerancePct : DEFAULT_TOLERANCE,
        resolutionStatus: r.resolutionStatus,
        resolutionMeta: (r.resolutionMeta ?? null) as Record<string, unknown> | null,
      });
      continue;
    }

    const entry = readNumber(result, getMappedField(mapping, "entry"));
    const tp = readNumber(result, getMappedField(mapping, "take_profit"));
    const sl = readNumber(result, getMappedField(mapping, "stop_loss"));
    if (entry === null || tp === null || sl === null) continue;
    if (side === "LONG" && (tp <= entry || sl >= entry)) continue;
    if (side === "SHORT" && (tp >= entry || sl <= entry)) continue;

    const meta = (r.resolutionMeta ?? null) as Record<string, unknown> | null;
    out.push({
      runId: r.id,
      agentId: r.agentId,
      side,
      entry,
      takeProfit: tp,
      stopLoss: sl,
      decisionAt,
      asset,
      timeframe,
      exchange: auto?.exchange || DEFAULT_EXCHANGE,
      expireBars,
      fillTolerancePct: typeof auto?.fillTolerancePct === "number" ? auto.fillTolerancePct : DEFAULT_TOLERANCE,
      resolutionStatus: r.resolutionStatus,
      resolutionMeta: meta,
      manualEntry: readManualEntry(meta),
      manualExit: readManualExit(meta),
    });
  }
  return out;
}

async function fetchCandlesViaCache(symbol: string, interval: string, sinceMs: number): Promise<Candle[]> {
  // Read-through the shared cache so the resolver's fetches also fill the DB
  // for the chart to read later. Resolver only needs OHLC + times — `volume`
  // comes along for free and is ignored here.
  const cached = await getCandles({ symbol, interval, from: sinceMs });
  return cached.map((c) => ({
    openTime: c.openTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    closeTime: c.closeTime,
  }));
}

async function tickOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  reportTick(SCHEDULER_ID, { status: "running", lastTickAt: new Date() });
  try {
    const trades = await findOpenTrades();
    if (trades.length === 0) {
      reportTick(SCHEDULER_ID, { status: "idle", meta: { open: 0, resolvedThisTick: 0 } });
      return;
    }

    // Group by (exchange, symbol, timeframe) — one fetch per group.
    const groups = new Map<string, OpenTrade[]>();
    for (const t of trades) {
      const key = `${t.exchange}|${normalizeSymbol(t.asset)}|${t.timeframe}`;
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }

    let resolvedCount = 0;
    let activeCount = 0;
    let errorCount = 0;

    for (const [key, list] of groups) {
      const [exchange, symbol, interval] = key.split("|");
      if (exchange !== "binance") continue; // only binance wired today
      const earliest = Math.min(...list.map((t) => t.decisionAt));
      let candles: Candle[];
      try {
        candles = await fetchCandlesViaCache(symbol, interval, earliest);
      } catch (err) {
        errorCount++;
        console.error(`[trade-resolver] fetch failed for ${key}:`, err instanceof Error ? err.message : err);
        continue;
      }

      // Check active price-watches for this symbol against the fresh candles.
      // Cheap — one indexed query and an in-memory scan.
      try {
        await processWatchesForSymbol(symbol, candles);
      } catch (err) {
        console.error(`[trade-resolver] watch check failed for ${symbol}:`, err instanceof Error ? err.message : err);
      }

      for (const trade of list) {
        // WAIT trades only ride along to keep candles warm — no levels to
        // resolve against, so skip the resolver call.
        if (trade.side === "WAIT") continue;
        const tradeCandles = candles.filter((c) => c.openTime >= trade.decisionAt);
        const result = resolveTradeFromCandles({
          side: trade.side,
          entry: trade.entry,
          takeProfit: trade.takeProfit,
          stopLoss: trade.stopLoss,
          decisionAt: trade.decisionAt,
          expireBars: trade.expireBars,
          fillTolerancePct: trade.fillTolerancePct,
          candles: tradeCandles,
          manualEntry: trade.manualEntry,
          manualExit: trade.manualExit,
        });

        const isFinal = result.status === "resolved" || result.status === "expired";
        if (isFinal) resolvedCount++;
        else if (result.status === "active") activeCount++;

        // Preserve manual overrides across writes — `result.meta` doesn't include them.
        const nextMeta: Record<string, unknown> = { ...(result.meta as Record<string, unknown>) };
        if (trade.manualEntry) nextMeta.manualEntry = trade.manualEntry;
        if (trade.manualExit) nextMeta.manualExit = trade.manualExit;

        await prisma.heartbeatRun.update({
          where: { id: trade.runId },
          data: {
            resolutionStatus: result.status,
            resolutionCheckedAt: new Date(),
            resolutionMeta: nextMeta as object,
            ...(isFinal
              ? {
                  outcome: result.outcome,
                  ...(result.outcomeFields ? { outcomeFields: result.outcomeFields as object } : {}),
                  outcomeAt: new Date(),
                }
              : {}),
          },
        });
      }
    }

    reportTick(SCHEDULER_ID, {
      status: errorCount > 0 ? "error" : "idle",
      lastError: errorCount > 0 ? `${errorCount} fetch group(s) failed` : undefined,
      meta: { open: trades.length, resolvedThisTick: resolvedCount, activeThisTick: activeCount },
    });
  } catch (err) {
    console.error("[trade-resolver] tick failed:", err);
    reportTick(SCHEDULER_ID, { status: "error", lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    inFlight = false;
  }
}

export function initTradeResolver(): void {
  reportTick(SCHEDULER_ID, {
    kind: "trade-resolver",
    label: SCHEDULER_LABEL,
    schedule: SCHEDULER_SCHEDULE,
    status: "idle",
  });
  // First tick after a short delay so boot is clean.
  setTimeout(() => { tickOnce().catch(() => {}); }, 5_000);
  timer = setInterval(() => { tickOnce().catch(() => {}); }, TICK_MS);
  if (timer.unref) timer.unref();
  console.log("[trade-resolver] initialised — tick every 60s");
}

export function stopTradeResolver(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
