import { describe, it, expect } from "vitest";
import { setupTestDb, getTestPrisma } from "./setup-db";
import { processWatchesForSymbol, findTriggeringCandle } from "../services/watch-checker";
import type { Candle } from "../services/trade-resolver";

setupTestDb();

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function bar(openTimeMs: number, open: number, high: number, low: number, close: number): Candle {
  return { openTime: openTimeMs, open, high, low, close, closeTime: openTimeMs + HOUR - 1 };
}

// Candles must have openTime > watch.createdAt to trigger — use times after
// "now" so any freshly-created watch is older than the candle.
function future(i: number): number {
  return Date.now() + i * HOUR;
}

async function makeRun() {
  const prisma = getTestPrisma();
  const agent = await prisma.agent.create({ data: { name: "Watch Agent" } });
  return prisma.heartbeatRun.create({
    data: { agentId: agent.id, status: "succeeded", finishedAt: new Date() },
  });
}

describe("price watch — schema + cascade", () => {
  it("creates and reads back a watch with defaults", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    const w = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 95000, direction: "below", label: "Break support" },
    });
    expect(w.status).toBe("active");
    expect(w.triggeredAt).toBeNull();
    expect(w.triggeredPrice).toBeNull();
    expect(w.symbol).toBe("BTCUSDT");
  });

  it("cascade-deletes watches when the parent run is deleted", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    await prisma.priceWatch.createMany({
      data: [
        { runId: run.id, symbol: "BTCUSDT", price: 100000, direction: "above", label: "A" },
        { runId: run.id, symbol: "BTCUSDT", price: 90000,  direction: "below", label: "B" },
      ],
    });
    await prisma.heartbeatRun.delete({ where: { id: run.id } });
    const left = await prisma.priceWatch.findMany({ where: { runId: run.id } });
    expect(left).toHaveLength(0);
  });

  it("filters by (symbol, status) — the indexed tick query path", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    await prisma.priceWatch.createMany({
      data: [
        { runId: run.id, symbol: "BTCUSDT", price: 100000, direction: "above", label: "BTC act" },
        { runId: run.id, symbol: "BTCUSDT", price: 99000,  direction: "above", label: "BTC tri", status: "triggered", triggeredAt: new Date(), triggeredPrice: 99000 },
        { runId: run.id, symbol: "ETHUSDT", price: 4000,   direction: "above", label: "ETH act" },
      ],
    });
    const active = await prisma.priceWatch.findMany({
      where: { symbol: "BTCUSDT", status: "active" },
    });
    expect(active).toHaveLength(1);
    expect(active[0].label).toBe("BTC act");
  });
});

describe("processWatchesForSymbol", () => {
  it("marks crossed watches as triggered and leaves uncrossed ones active", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    const crossed = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 105, direction: "above", label: "Will cross" },
    });
    const notCrossed = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 200, direction: "above", label: "Far away" },
    });
    const wrongSymbol = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "ETHUSDT", price: 50,  direction: "below", label: "Different asset" },
    });

    const triggered = await processWatchesForSymbol("BTCUSDT", [bar(future(1), 100, 110, 99, 108)]);
    expect(triggered).toBe(1);

    const after = await prisma.priceWatch.findMany({ orderBy: { createdAt: "asc" } });
    const byId = Object.fromEntries(after.map((w) => [w.id, w]));
    expect(byId[crossed.id].status).toBe("triggered");
    expect(byId[crossed.id].triggeredPrice).toBe(105);
    expect(byId[crossed.id].triggeredAt).not.toBeNull();
    expect(byId[notCrossed.id].status).toBe("active");
    expect(byId[wrongSymbol.id].status).toBe("active");
  });

  it("does not retro-trigger on candles older than the watch", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    // Watch is created NOW; the candle is from T0 (way in the past).
    const w = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 105, direction: "above", label: "Just made" },
    });
    const triggered = await processWatchesForSymbol("BTCUSDT", [bar(T0 + HOUR, 100, 110, 99, 108)]);
    expect(triggered).toBe(0);
    const after = await prisma.priceWatch.findUnique({ where: { id: w.id } });
    expect(after!.status).toBe("active");
  });

  it("is idempotent — running twice on the same data only triggers once", async () => {
    const prisma = getTestPrisma();
    const run = await makeRun();
    await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 105, direction: "above", label: "Crosses" },
    });
    const candles = [bar(future(1), 100, 110, 99, 108)];

    const first = await processWatchesForSymbol("BTCUSDT", candles);
    const second = await processWatchesForSymbol("BTCUSDT", candles);
    expect(first).toBe(1);
    expect(second).toBe(0); // already flipped to "triggered", not in the active query result
  });

  it("returns 0 for empty candles and empty active set", async () => {
    expect(await processWatchesForSymbol("BTCUSDT", [])).toBe(0);
    expect(await processWatchesForSymbol("BTCUSDT", [bar(future(1), 100, 110, 99, 108)])).toBe(0);
  });

  it("findTriggeringCandle is consistent with the DB-driven path", async () => {
    // Sanity check: the DB driver picks the same earliest-cross as the pure function.
    const prisma = getTestPrisma();
    const run = await makeRun();
    const w = await prisma.priceWatch.create({
      data: { runId: run.id, symbol: "BTCUSDT", price: 105, direction: "above", label: "x" },
    });
    const c1Time = future(1);
    const candles = [bar(c1Time, 100, 106, 99, 104), bar(future(2), 104, 120, 103, 118)];
    const pure = findTriggeringCandle({ price: 105, direction: "above", createdAt: w.createdAt }, candles);
    expect(pure?.triggeredAt).toBe(c1Time);

    await processWatchesForSymbol("BTCUSDT", candles);
    const after = await prisma.priceWatch.findUnique({ where: { id: w.id } });
    expect(after!.triggeredAt!.getTime()).toBe(c1Time);
  });
});
