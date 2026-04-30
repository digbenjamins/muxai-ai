import { describe, it, expect } from "vitest";
import { setupTestDb, getTestPrisma } from "./setup-db";

setupTestDb();

const HOUR = 60 * 60 * 1000;

function inHours(h: number): Date {
  return new Date(Date.now() + h * HOUR);
}

describe("events integration", () => {
  it("creates an event and reads it back", async () => {
    const prisma = getTestPrisma();
    const ev = await prisma.event.create({
      data: {
        source: "forexfactory",
        sourceId: "USD|FOMC|2026-04-30T18:00:00Z",
        kind: "macro",
        asset: null,
        title: "[USD] Federal Funds Rate",
        importance: "high",
        startsAt: inHours(24),
        metadata: { country: "USD", forecast: "5.25%" },
      },
    });

    expect(ev.id).toBeDefined();
    expect(ev.source).toBe("forexfactory");
    expect(ev.importance).toBe("high");
    expect(ev.fetchedAt).toBeInstanceOf(Date);

    const fetched = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(fetched!.title).toBe("[USD] Federal Funds Rate");
    expect((fetched!.metadata as Record<string, unknown>).country).toBe("USD");
  });

  it("upserts on (source, sourceId) so re-fetching the same event does not duplicate", async () => {
    const prisma = getTestPrisma();
    const where = { source_sourceId: { source: "deribit", sourceId: "BTC-expiry-12345" } };

    const first = await prisma.event.upsert({
      where,
      create: {
        source: "deribit",
        sourceId: "BTC-expiry-12345",
        kind: "options-expiry",
        asset: "BTC",
        title: "BTC options expiry",
        importance: "medium",
        startsAt: inHours(48),
      },
      update: {},
    });

    // Same source+sourceId, but updated importance — should mutate the existing row, not insert.
    const second = await prisma.event.upsert({
      where,
      create: {
        source: "deribit",
        sourceId: "BTC-expiry-12345",
        kind: "options-expiry",
        asset: "BTC",
        title: "BTC options expiry (monthly)",
        importance: "high",
        startsAt: inHours(48),
      },
      update: { title: "BTC options expiry (monthly)", importance: "high" },
    });

    expect(second.id).toBe(first.id);
    expect(second.importance).toBe("high");
    expect(second.title).toBe("BTC options expiry (monthly)");

    const all = await prisma.event.findMany({ where: { source: "deribit" } });
    expect(all).toHaveLength(1);
  });

  it("filters upcoming events by time window — the contract /api/events/upcoming relies on", async () => {
    const prisma = getTestPrisma();
    await prisma.event.createMany({
      data: [
        { source: "test", sourceId: "past-1", kind: "macro", title: "Past event", importance: "high", startsAt: inHours(-2) },
        { source: "test", sourceId: "in-12h", kind: "macro", title: "In 12h", importance: "high", startsAt: inHours(12) },
        { source: "test", sourceId: "in-72h", kind: "macro", title: "In 72h", importance: "high", startsAt: inHours(72) },
      ],
    });

    const now = new Date();
    const horizon = new Date(now.getTime() + 48 * HOUR);
    const within48h = await prisma.event.findMany({
      where: { startsAt: { gte: now, lte: horizon } },
      orderBy: { startsAt: "asc" },
    });

    expect(within48h).toHaveLength(1);
    expect(within48h[0].sourceId).toBe("in-12h");
  });

  it("asset-aware filter returns macro (asset=null) plus the requested asset", async () => {
    const prisma = getTestPrisma();
    await prisma.event.createMany({
      data: [
        { source: "test", sourceId: "macro", kind: "macro", asset: null, title: "FOMC", importance: "high", startsAt: inHours(6) },
        { source: "test", sourceId: "btc-evt", kind: "options-expiry", asset: "BTC", title: "BTC expiry", importance: "high", startsAt: inHours(6) },
        { source: "test", sourceId: "eth-evt", kind: "options-expiry", asset: "ETH", title: "ETH expiry", importance: "high", startsAt: inHours(6) },
      ],
    });

    // Mirrors the OR clause in /api/events/upcoming when asset=BTC is passed.
    const forBtc = await prisma.event.findMany({
      where: {
        startsAt: { gte: new Date(Date.now() - HOUR), lte: inHours(48) },
        OR: [{ asset: "BTC" }, { asset: null }],
      },
      orderBy: { startsAt: "asc" },
    });

    const titles = forBtc.map((e) => e.title).sort();
    expect(titles).toEqual(["BTC expiry", "FOMC"]);
    // ETH is excluded because asset=BTC and asset is non-null
    expect(forBtc.find((e) => e.title === "ETH expiry")).toBeUndefined();
  });

  it("importance filter — \"medium\" keyword should include both high and medium events", async () => {
    const prisma = getTestPrisma();
    await prisma.event.createMany({
      data: [
        { source: "test", sourceId: "h", kind: "macro", title: "High", importance: "high", startsAt: inHours(2) },
        { source: "test", sourceId: "m", kind: "macro", title: "Medium", importance: "medium", startsAt: inHours(2) },
        { source: "test", sourceId: "l", kind: "macro", title: "Low", importance: "low", startsAt: inHours(2) },
      ],
    });

    // Mirrors how the route maps importance="medium" to a high+medium filter.
    const highOrMedium = await prisma.event.findMany({
      where: {
        startsAt: { gte: new Date(Date.now() - HOUR) },
        importance: { in: ["high", "medium"] },
      },
    });

    const titles = highOrMedium.map((e) => e.title).sort();
    expect(titles).toEqual(["High", "Medium"]);
  });

  it("recent events — past window query returns events whose startsAt is in the last N hours", async () => {
    const prisma = getTestPrisma();
    await prisma.event.createMany({
      data: [
        { source: "test", sourceId: "long-ago", kind: "hack", title: "Old hack", importance: "high", startsAt: inHours(-72) },
        { source: "test", sourceId: "yesterday", kind: "hack", title: "Yesterday's hack", importance: "high", startsAt: inHours(-12) },
        { source: "test", sourceId: "future", kind: "hack", title: "Future hack", importance: "high", startsAt: inHours(2) },
      ],
    });

    const since = new Date(Date.now() - 24 * HOUR);
    const recent = await prisma.event.findMany({
      where: { startsAt: { gte: since, lte: new Date() } },
      orderBy: { startsAt: "desc" },
    });

    expect(recent).toHaveLength(1);
    expect(recent[0].title).toBe("Yesterday's hack");
  });
});
