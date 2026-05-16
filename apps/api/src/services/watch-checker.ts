// Price-watch trigger detection. Pure function (testable) plus a DB-touching
// driver that the resolver tick calls after fetching fresh candles.

import { prisma } from "../lib/db";
import type { Candle } from "./trade-resolver";

export interface WatchSnapshot {
  id: string;
  price: number;
  direction: string;   // "above" | "below"
  createdAt: Date;
  label: string;
  runId: string;
  symbol: string;
}

export interface TriggerHit {
  triggeredAt: number;   // ms epoch (candle openTime where the cross happened)
  triggeredPrice: number;
}

/**
 * Pure trigger check: returns the earliest candle (by openTime) after the
 * watch was created where the price level was crossed in the watch's
 * direction. Returns null if no candle in `candles` triggers it.
 */
export function findTriggeringCandle(
  watch: { price: number; direction: string; createdAt: Date },
  candles: Candle[],
): TriggerHit | null {
  const createdAtMs = watch.createdAt.getTime();
  for (const c of candles) {
    if (c.openTime <= createdAtMs) continue;
    if (watch.direction === "above" && c.high >= watch.price) {
      return { triggeredAt: c.openTime, triggeredPrice: watch.price };
    }
    if (watch.direction === "below" && c.low <= watch.price) {
      return { triggeredAt: c.openTime, triggeredPrice: watch.price };
    }
  }
  return null;
}

/**
 * Check every active watch for `symbol` against the supplied candles and
 * persist triggers. Idempotent: a watch flipped to "triggered" stays out of
 * the active set, so the next tick won't re-process it.
 */
export async function processWatchesForSymbol(symbol: string, candles: Candle[]): Promise<number> {
  if (candles.length === 0) return 0;
  const active = await prisma.priceWatch.findMany({
    where: { symbol, status: "active" },
  });
  if (active.length === 0) return 0;

  let triggered = 0;
  for (const w of active) {
    const hit = findTriggeringCandle(w, candles);
    if (!hit) continue;
    await prisma.priceWatch.update({
      where: { id: w.id },
      data: {
        status: "triggered",
        triggeredAt: new Date(hit.triggeredAt),
        triggeredPrice: hit.triggeredPrice,
      },
    });
    // Notification firing is a stub for now — easy to swap for a real channel.
    console.log(
      `[watch] triggered: id=${w.id} run=${w.runId} ${w.symbol} ${w.direction} @ ${w.price} — "${w.label}"`,
    );
    triggered++;
  }
  return triggered;
}
