// Pure resolver — given a trade decision and a series of candles, decide whether
// the trade entered, hit TP, hit SL, or expired. No I/O, no DB. Deterministic.

export type TradeSide = "LONG" | "SHORT";

export interface Candle {
  openTime: number; // ms epoch — bar open
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number; // ms epoch — bar close
}

export interface ResolveInput {
  side: TradeSide;
  entry: number;
  takeProfit: number;
  stopLoss: number;
  decisionAt: number;       // ms epoch — when the trade decision was emitted
  expireBars: number;       // close as expired/NA after this many bars from decisionAt
  fillTolerancePct: number; // entry "hit" if price came within this % of entry
  candles: Candle[];        // candles AFTER decisionAt, oldest → newest
}

export type ResolveStatus = "pending" | "active" | "resolved" | "expired";

export interface ResolveResult {
  status: ResolveStatus;
  outcome?: "Win" | "Loss" | "NA";
  outcomeFields?: {
    source: "auto";
    r_multiple?: number;
    entry_fill?: number;
    exit_price?: number;
    bars_to_entry?: number;
    bars_to_exit?: number;
  };
  meta: {
    enteredAt?: number;
    hitAt?: number;
    barsConsidered: number;
    reason?: "tp_hit" | "sl_hit" | "same_bar_collision" | "no_fill_expired" | "no_resolution_expired";
  };
}

/**
 * Walk forward through candles after decisionAt and decide outcome.
 * Conservative rule: if a single bar's range hits both TP and SL, treat as Loss
 * (we have no intra-bar data to know which came first).
 */
export function resolveTradeFromCandles(input: ResolveInput): ResolveResult {
  const { side, entry, takeProfit, stopLoss, decisionAt, expireBars, fillTolerancePct, candles } = input;

  const bars = candles.filter((c) => c.openTime >= decisionAt).slice(0, expireBars);
  const tolerance = entry * (fillTolerancePct / 100);
  const entryLow = entry - tolerance;
  const entryHigh = entry + tolerance;

  const rDenom = side === "LONG" ? entry - stopLoss : stopLoss - entry;
  const rNum = side === "LONG" ? takeProfit - entry : entry - takeProfit;
  const winR = rDenom > 0 ? rNum / rDenom : 0;

  let enteredAt: number | undefined;
  let entryBarIndex = -1;
  let entryFill: number | undefined;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // Pre-entry: did this bar print the entry price?
    if (entryBarIndex === -1) {
      const touchedEntry = bar.low <= entryHigh && bar.high >= entryLow;
      if (!touchedEntry) continue;
      enteredAt = bar.openTime;
      entryBarIndex = i;
      entryFill = clamp(entry, bar.low, bar.high);
      // Same bar — could TP or SL also have hit? If so, conservative: treat as
      // "filled but unresolved this bar", check next bar onwards. (We can't say
      // entry-then-SL vs SL-then-entry without intra-bar data — being lenient on
      // entry but strict on exit.)
    }

    if (entryBarIndex === -1) continue;

    // Post-entry (or same-bar after fill): check TP/SL
    if (i === entryBarIndex && entryFill !== undefined) {
      // On the entry bar itself, TP/SL only "count" if the bar's extreme breached
      // the level after entry was filled. We approximate by checking whether the
      // bar reached past TP/SL at all — if BOTH, it's a same-bar collision.
      const sameBarTp = side === "LONG" ? bar.high >= takeProfit : bar.low <= takeProfit;
      const sameBarSl = side === "LONG" ? bar.low <= stopLoss : bar.high >= stopLoss;
      if (sameBarTp && sameBarSl) {
        return collisionLoss(entry, stopLoss, side, enteredAt!, bar, i);
      }
      if (sameBarSl) return slHit(side, entry, stopLoss, enteredAt!, bar, i);
      if (sameBarTp) return tpHit(side, takeProfit, winR, enteredAt!, bar, i);
      continue;
    }

    const tpHitNow = side === "LONG" ? bar.high >= takeProfit : bar.low <= takeProfit;
    const slHitNow = side === "LONG" ? bar.low <= stopLoss : bar.high >= stopLoss;
    if (tpHitNow && slHitNow) return collisionLoss(entry, stopLoss, side, enteredAt!, bar, i);
    if (slHitNow) return slHit(side, entry, stopLoss, enteredAt!, bar, i);
    if (tpHitNow) return tpHit(side, takeProfit, winR, enteredAt!, bar, i);
  }

  // Walked all available bars without TP/SL.
  if (bars.length < expireBars) {
    return {
      status: entryBarIndex === -1 ? "pending" : "active",
      meta: { barsConsidered: bars.length, enteredAt },
    };
  }

  // Out of bars (>= expireBars) → expired.
  if (entryBarIndex === -1) {
    return {
      status: "expired",
      outcome: "NA",
      outcomeFields: { source: "auto" },
      meta: { barsConsidered: bars.length, reason: "no_fill_expired" },
    };
  }
  // Entered but never resolved — mark NA with mark-to-market.
  const lastClose = bars[bars.length - 1].close;
  const mtmR = side === "LONG"
    ? rDenom > 0 ? (lastClose - entry) / rDenom : 0
    : rDenom > 0 ? (entry - lastClose) / rDenom : 0;
  return {
    status: "expired",
    outcome: "NA",
    outcomeFields: {
      source: "auto",
      r_multiple: round(mtmR, 2),
      entry_fill: entryFill,
      exit_price: lastClose,
      bars_to_entry: entryBarIndex,
      bars_to_exit: bars.length - 1,
    },
    meta: { enteredAt, barsConsidered: bars.length, reason: "no_resolution_expired" },
  };
}

function tpHit(side: TradeSide, tp: number, winR: number, enteredAt: number, bar: Candle, idx: number): ResolveResult {
  void side;
  return {
    status: "resolved",
    outcome: "Win",
    outcomeFields: { source: "auto", r_multiple: round(winR, 2), exit_price: tp, bars_to_exit: idx },
    meta: { enteredAt, hitAt: bar.openTime, barsConsidered: idx + 1, reason: "tp_hit" },
  };
}

function slHit(side: TradeSide, entry: number, sl: number, enteredAt: number, bar: Candle, idx: number): ResolveResult {
  void side; void entry;
  return {
    status: "resolved",
    outcome: "Loss",
    outcomeFields: { source: "auto", r_multiple: -1, exit_price: sl, bars_to_exit: idx },
    meta: { enteredAt, hitAt: bar.openTime, barsConsidered: idx + 1, reason: "sl_hit" },
  };
}

function collisionLoss(entry: number, sl: number, side: TradeSide, enteredAt: number, bar: Candle, idx: number): ResolveResult {
  void entry; void side;
  return {
    status: "resolved",
    outcome: "Loss",
    outcomeFields: { source: "auto", r_multiple: -1, exit_price: sl, bars_to_exit: idx },
    meta: { enteredAt, hitAt: bar.openTime, barsConsidered: idx + 1, reason: "same_bar_collision" },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, dp: number): number {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}
