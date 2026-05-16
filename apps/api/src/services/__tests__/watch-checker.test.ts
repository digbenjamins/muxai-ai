import { describe, it, expect } from "vitest";
import { findTriggeringCandle } from "../watch-checker";
import type { Candle } from "../trade-resolver";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function bar(i: number, open: number, high: number, low: number, close: number): Candle {
  return {
    openTime: T0 + i * HOUR,
    open, high, low, close,
    closeTime: T0 + (i + 1) * HOUR - 1,
  };
}

describe("findTriggeringCandle", () => {
  it("above — triggers when high crosses level on a candle after createdAt", () => {
    const watch = { price: 105, direction: "above", createdAt: new Date(T0) };
    const candles = [
      bar(0, 99, 101, 98, 100),     // before — opens AT createdAt, excluded
      bar(1, 100, 104, 99, 102),    // not yet
      bar(2, 102, 108, 101, 107),   // crosses 105
    ];
    expect(findTriggeringCandle(watch, candles)).toEqual({
      triggeredAt: T0 + 2 * HOUR,
      triggeredPrice: 105,
    });
  });

  it("below — triggers when low crosses level downward", () => {
    const watch = { price: 95, direction: "below", createdAt: new Date(T0) };
    const candles = [
      bar(1, 100, 101, 97, 98),  // doesn't reach 95
      bar(2, 98, 99, 94, 96),    // low 94 < 95 → triggers
    ];
    expect(findTriggeringCandle(watch, candles)).toEqual({
      triggeredAt: T0 + 2 * HOUR,
      triggeredPrice: 95,
    });
  });

  it("returns null when no candle crosses", () => {
    const watch = { price: 200, direction: "above", createdAt: new Date(T0) };
    const candles = [bar(1, 100, 110, 95, 105), bar(2, 105, 115, 100, 110)];
    expect(findTriggeringCandle(watch, candles)).toBeNull();
  });

  it("ignores candles whose openTime is at or before createdAt", () => {
    // A historical candle that would have crossed shouldn't retro-trigger.
    const watch = { price: 95, direction: "below", createdAt: new Date(T0 + 2 * HOUR) };
    const candles = [
      bar(1, 100, 101, 90, 95),  // crosses, but BEFORE createdAt
      bar(2, 100, 101, 96, 99),  // at createdAt — also excluded
      bar(3, 99, 100, 97, 98),   // after, doesn't cross
    ];
    expect(findTriggeringCandle(watch, candles)).toBeNull();
  });

  it("returns the earliest triggering candle (not the most extreme)", () => {
    const watch = { price: 105, direction: "above", createdAt: new Date(T0) };
    const candles = [
      bar(1, 100, 106, 99, 105),    // first cross at bar 1
      bar(2, 105, 120, 104, 118),   // bigger cross later — should NOT win
    ];
    const hit = findTriggeringCandle(watch, candles);
    expect(hit?.triggeredAt).toBe(T0 + 1 * HOUR);
  });

  it("exact touch on the level counts as a cross (high === price for above)", () => {
    const watch = { price: 105, direction: "above", createdAt: new Date(T0) };
    const candles = [bar(1, 100, 105, 99, 104)]; // exactly tags 105
    expect(findTriggeringCandle(watch, candles)).not.toBeNull();
  });

  it("returns null on empty candles", () => {
    const watch = { price: 105, direction: "above", createdAt: new Date(T0) };
    expect(findTriggeringCandle(watch, [])).toBeNull();
  });
});
