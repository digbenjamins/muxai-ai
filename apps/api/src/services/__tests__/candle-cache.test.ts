import { describe, it, expect } from "vitest";
import { findGaps, alignToBar, intervalToMs } from "../candle-cache";

const HOUR = 3_600_000;

describe("intervalToMs", () => {
  it("parses standard intervals", () => {
    expect(intervalToMs("15m")).toBe(15 * 60_000);
    expect(intervalToMs("1h")).toBe(HOUR);
    expect(intervalToMs("4h")).toBe(4 * HOUR);
    expect(intervalToMs("1d")).toBe(86_400_000);
  });
  it("rejects unsupported intervals", () => {
    expect(intervalToMs("1M")).toBeNull();
    expect(intervalToMs("garbage")).toBeNull();
  });
});

describe("alignToBar", () => {
  it("snaps timestamps down to bar boundaries", () => {
    // Pick a known 4h boundary on the Unix epoch (4h aligns with epoch).
    const t = 100 * HOUR + 17 * 60_000; // 100h + 17m
    expect(alignToBar(t, 4 * HOUR)).toBe(100 * HOUR);
    expect(alignToBar(100 * HOUR, 4 * HOUR)).toBe(100 * HOUR);
  });
});

describe("findGaps", () => {
  const intervalMs = HOUR;
  const from = 100 * HOUR;
  const to = 105 * HOUR; // bars at 100..105 = 6 bars

  it("returns one big gap when cache is empty", () => {
    const gaps = findGaps(from, to, intervalMs, []);
    expect(gaps).toEqual([{ from: 100 * HOUR, to: 105 * HOUR }]);
  });

  it("returns no gaps when cache is fully populated", () => {
    const cached = [100, 101, 102, 103, 104, 105].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([]);
  });

  it("returns leading gap when tail is cached", () => {
    const cached = [103, 104, 105].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([{ from: 100 * HOUR, to: 102 * HOUR }]);
  });

  it("returns trailing gap when head is cached", () => {
    const cached = [100, 101, 102].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([{ from: 103 * HOUR, to: 105 * HOUR }]);
  });

  it("splits around an internal gap", () => {
    const cached = [100, 101, 104, 105].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([{ from: 102 * HOUR, to: 103 * HOUR }]);
  });

  it("handles multiple internal gaps", () => {
    const cached = [100, 102, 104].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([
      { from: 101 * HOUR, to: 101 * HOUR },
      { from: 103 * HOUR, to: 103 * HOUR },
      { from: 105 * HOUR, to: 105 * HOUR },
    ]);
  });

  it("ignores cached bars outside the requested range", () => {
    const cached = [50, 200].map((h) => h * HOUR);
    const gaps = findGaps(from, to, intervalMs, cached);
    expect(gaps).toEqual([{ from: 100 * HOUR, to: 105 * HOUR }]);
  });

  it("aligns unaligned from/to to bar boundaries", () => {
    // Request 100h + 30m to 105h + 45m → should align to 100h..105h.
    const gaps = findGaps(100 * HOUR + 30 * 60_000, 105 * HOUR + 45 * 60_000, intervalMs, []);
    expect(gaps).toEqual([{ from: 100 * HOUR, to: 105 * HOUR }]);
  });
});
