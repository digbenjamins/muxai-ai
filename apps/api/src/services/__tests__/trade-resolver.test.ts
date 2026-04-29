import { describe, it, expect } from "vitest";
import { resolveTradeFromCandles, type Candle } from "../trade-resolver";

const T0 = 1_700_000_000_000;
const ONE_HOUR = 3600 * 1000;

function bar(i: number, open: number, high: number, low: number, close: number): Candle {
  return { openTime: T0 + i * ONE_HOUR, open, high, low, close, closeTime: T0 + (i + 1) * ONE_HOUR - 1 };
}

const baseInput = {
  side: "LONG" as const,
  entry: 100,
  takeProfit: 110,
  stopLoss: 95,
  decisionAt: T0,
  expireBars: 24,
  fillTolerancePct: 0.1,
};

describe("resolveTradeFromCandles", () => {
  it("LONG win — entry filled, TP hit on later bar", () => {
    const candles = [
      bar(0, 99, 101, 98, 100),   // entry filled (price prints 100)
      bar(1, 100, 105, 99, 104),
      bar(2, 104, 112, 103, 110), // TP hit (high 112 >= 110)
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("resolved");
    expect(out.outcome).toBe("Win");
    expect(out.outcomeFields?.r_multiple).toBe(2); // (110-100)/(100-95) = 2
    expect(out.meta.reason).toBe("tp_hit");
  });

  it("LONG loss — entry filled, SL hit on later bar", () => {
    const candles = [
      bar(0, 99, 101, 98, 100),  // entry filled
      bar(1, 100, 102, 96, 97),
      bar(2, 97, 98, 94, 95),    // SL hit
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("resolved");
    expect(out.outcome).toBe("Loss");
    expect(out.outcomeFields?.r_multiple).toBe(-1);
    expect(out.meta.reason).toBe("sl_hit");
  });

  it("no fill, expired — price never reaches entry within expireBars", () => {
    const candles = Array.from({ length: 24 }, (_, i) => bar(i, 200, 205, 195, 200));
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("expired");
    expect(out.outcome).toBe("NA");
    expect(out.meta.reason).toBe("no_fill_expired");
  });

  it("gap through SL — bar opens below SL, low far below SL", () => {
    const candles = [
      bar(0, 99, 101, 98, 100),  // entry
      bar(1, 100, 100, 99, 99),
      bar(2, 90, 90, 85, 88),    // gap down — low 85 << SL 95
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.outcome).toBe("Loss");
    expect(out.meta.reason).toBe("sl_hit");
  });

  it("same-bar TP/SL collision after entry — Loss (conservative)", () => {
    const candles = [
      bar(0, 99, 101, 98, 100),  // entry filled
      bar(1, 100, 112, 94, 100), // bar reaches both TP=110 and SL=95 in the same bar
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.outcome).toBe("Loss");
    expect(out.meta.reason).toBe("same_bar_collision");
  });

  it("still active — entered, no TP/SL yet, more bars allowed", () => {
    const candles = [
      bar(0, 99, 101, 98, 100),
      bar(1, 100, 103, 99, 102),
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("active");
    expect(out.meta.enteredAt).toBe(T0);
  });

  it("pending — no entry yet, more bars allowed", () => {
    const candles = [bar(0, 200, 205, 195, 200)];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("pending");
  });

  it("entered but expired without resolution — NA with mark-to-market R", () => {
    const candles: Candle[] = [
      bar(0, 99, 101, 98, 100),  // entry
      ...Array.from({ length: 23 }, (_, i) => bar(i + 1, 102, 104, 101, 103)), // never hits TP/SL
    ];
    const out = resolveTradeFromCandles({ ...baseInput, candles });
    expect(out.status).toBe("expired");
    expect(out.outcome).toBe("NA");
    expect(out.meta.reason).toBe("no_resolution_expired");
    // last close 103, entry 100, R denom 5 → +0.6R
    expect(out.outcomeFields?.r_multiple).toBeCloseTo(0.6, 1);
  });

  it("SHORT win — entry filled, TP hit (price falls)", () => {
    const candles = [
      bar(0, 101, 102, 99, 100),  // entry filled at 100
      bar(1, 100, 100, 95, 96),
      bar(2, 96, 97, 88, 90),     // TP=90 hit (low <= 90)
    ];
    const out = resolveTradeFromCandles({
      ...baseInput,
      side: "SHORT",
      entry: 100,
      takeProfit: 90,
      stopLoss: 105,
      candles,
    });
    expect(out.status).toBe("resolved");
    expect(out.outcome).toBe("Win");
    expect(out.outcomeFields?.r_multiple).toBe(2); // (100-90)/(105-100)=2
  });

  it("SHORT loss — SL above entry hit", () => {
    const candles = [
      bar(0, 101, 102, 99, 100),
      bar(1, 100, 106, 100, 105), // SL=105 hit
    ];
    const out = resolveTradeFromCandles({
      ...baseInput,
      side: "SHORT",
      entry: 100,
      takeProfit: 90,
      stopLoss: 105,
      candles,
    });
    expect(out.outcome).toBe("Loss");
  });
});
