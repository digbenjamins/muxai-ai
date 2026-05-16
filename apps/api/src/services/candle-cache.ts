// Candle cache — DB-first read with Binance gap-fill + write-through.
//
// Both the chart route and the resolver tick consume candles via this service
// so opportunistic fetches by either side fill a shared store. Bars currently
// being formed (closeTime > now) are returned to callers but not persisted.

import { prisma } from "../lib/db";

export interface CachedCandle {
  openTime: number;   // ms epoch
  closeTime: number;  // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function normalizeSymbol(asset: string): string {
  return asset.toUpperCase().replace(/[\/\-_\s]/g, "");
}

export function intervalToMs(interval: string): number | null {
  const m = interval.match(/^(\d+)([mhdwM])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    case "d": return n * 86_400_000;
    case "w": return n * 7 * 86_400_000;
    default:  return null; // "M" is irregular; not supported in cache for now
  }
}

// Bar boundaries align with the Unix epoch for m/h/d intervals on Binance —
// floor(t / intervalMs) * intervalMs gives the bar that contains time `t`.
export function alignToBar(ms: number, intervalMs: number): number {
  return Math.floor(ms / intervalMs) * intervalMs;
}

// Pure gap-detection. Given the cached openTimes and the requested range,
// return the contiguous (inclusive) ranges that still need to be fetched.
// `cachedOpenTimes` does NOT need to be sorted or deduped.
export function findGaps(
  fromMs: number,
  toMs: number,
  intervalMs: number,
  cachedOpenTimes: Iterable<number>,
): { from: number; to: number }[] {
  const start = alignToBar(fromMs, intervalMs);
  const end = alignToBar(toMs, intervalMs);
  if (end < start) return [];

  const cached = new Set<number>();
  for (const t of cachedOpenTimes) {
    if (t >= start && t <= end) cached.add(alignToBar(t, intervalMs));
  }

  const gaps: { from: number; to: number }[] = [];
  let gapStart: number | null = null;
  for (let t = start; t <= end; t += intervalMs) {
    if (cached.has(t)) {
      if (gapStart !== null) {
        gaps.push({ from: gapStart, to: t - intervalMs });
        gapStart = null;
      }
    } else {
      if (gapStart === null) gapStart = t;
    }
  }
  if (gapStart !== null) gaps.push({ from: gapStart, to: end });
  return gaps;
}

interface FetchOpts {
  symbol: string;   // raw or normalized
  interval: string;
  from: number;     // ms inclusive
  to?: number;      // ms inclusive, defaults to Date.now()
  limit?: number;   // optional cap on returned candles (most-recent N)
}

export async function getCandles(opts: FetchOpts): Promise<CachedCandle[]> {
  const symbol = normalizeSymbol(opts.symbol);
  const interval = opts.interval;
  const intervalMs = intervalToMs(interval);
  if (!intervalMs) throw new Error(`Unsupported interval: ${interval}`);

  const to = opts.to ?? Date.now();
  const from = opts.from;
  if (to < from) return [];

  // 1. Read what we have in DB for this range.
  const cached = await prisma.candle.findMany({
    where: {
      symbol,
      interval,
      openTime: { gte: BigInt(alignToBar(from, intervalMs)), lte: BigInt(alignToBar(to, intervalMs)) },
    },
    orderBy: { openTime: "asc" },
  });

  // 2. Detect gaps and fetch them from Binance.
  const cachedOpenTimes = cached.map((c) => Number(c.openTime));
  const gaps = findGaps(from, to, intervalMs, cachedOpenTimes);

  const fetched: CachedCandle[] = [];
  for (const gap of gaps) {
    const range = await fetchBinanceRange(symbol, interval, gap.from, gap.to, intervalMs);
    fetched.push(...range);
  }

  // 3. Persist anything we fetched, but skip the currently-open bar (its
  // closeTime is in the future and it's still mutating tick-by-tick).
  const now = Date.now();
  const toPersist = fetched.filter((c) => c.closeTime <= now);
  if (toPersist.length > 0) {
    await persistCandles(symbol, interval, toPersist);
  }

  // 4. Merge cached + fetched, dedupe by openTime, sort, apply limit.
  const merged = new Map<number, CachedCandle>();
  for (const c of cached) {
    merged.set(Number(c.openTime), {
      openTime: Number(c.openTime),
      closeTime: Number(c.closeTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    });
  }
  for (const c of fetched) merged.set(c.openTime, c);

  const out = Array.from(merged.values()).sort((a, b) => a.openTime - b.openTime);
  if (opts.limit && out.length > opts.limit) return out.slice(out.length - opts.limit);
  return out;
}

async function fetchBinanceRange(
  symbol: string,
  interval: string,
  fromMs: number,
  toMs: number,
  intervalMs: number,
): Promise<CachedCandle[]> {
  // Binance caps at 1000 bars per request. For large gaps (e.g. an unwatched
  // timeframe over weeks) we page forward.
  const out: CachedCandle[] = [];
  let cursor = fromMs;
  let safety = 20; // hard upper bound — 20k bars covers months of 15m data
  while (cursor <= toMs && safety-- > 0) {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: String(cursor),
      endTime: String(toMs),
      limit: "1000",
    });
    const res = await fetch(`https://api.binance.com/api/v3/klines?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (raw.length === 0) break;
    for (const k of raw) {
      out.push({
        openTime: Number(k[0]),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        closeTime: Number(k[6]),
      });
    }
    const lastOpen = Number(raw[raw.length - 1][0]);
    const nextCursor = lastOpen + intervalMs;
    if (nextCursor <= cursor) break; // defensive — avoid infinite loop on weird responses
    cursor = nextCursor;
    if (raw.length < 1000) break; // we got the tail of the range
  }
  return out;
}

async function persistCandles(symbol: string, interval: string, candles: CachedCandle[]): Promise<void> {
  // Use createMany with skipDuplicates — the PK is (symbol, interval, openTime)
  // so concurrent writers can race without us caring.
  await prisma.candle.createMany({
    data: candles.map((c) => ({
      symbol,
      interval,
      openTime: BigInt(c.openTime),
      closeTime: BigInt(c.closeTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
    skipDuplicates: true,
  });
}
