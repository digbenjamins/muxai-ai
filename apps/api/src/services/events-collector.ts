// Events-collector background tick. Every TICK_MS, fetches calendar data from
// public sources (no API keys, out-of-the-box) and upserts into the Event table
// so the news-analyst's Event Gate can read it without making external calls.
//
// Sources are isolated — one failure does not take down the others. To add a
// source, write a fetcher that returns { events, error? } and append it to
// SOURCE_FETCHERS. See packages/mcp-events/README.md for the contract.

import { prisma } from "../lib/db";
import { reportTick } from "./scheduler-registry";

const TICK_MS = 30 * 60 * 1000; // 30 minutes
const SCHEDULER_ID = "events-collector";
const SCHEDULER_LABEL = "Events Collector";
const SCHEDULER_SCHEDULE = "30m";

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export interface EventInput {
  source: string;
  sourceId: string;
  kind: string;
  asset?: string | null;
  title: string;
  description?: string | null;
  importance: "high" | "medium" | "low";
  startsAt: Date;
  endsAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

interface FetchResult {
  source: string;
  events: EventInput[];
  error?: string;
}

// ─── ForexFactory — macro econ calendar (FOMC, CPI, NFP, ECB, BoE) ───────────
// Only currencies whose data actually moves crypto. SNB / AUD / JPY data is
// "High impact" globally but barely registers on BTC. USD dominates; EUR/GBP
// matter via DXY; CNY occasionally for risk-on/off.
const CRYPTO_RELEVANT_CURRENCIES = new Set(["USD", "EUR", "GBP", "CNY"]);

async function fetchForexFactory(): Promise<FetchResult> {
  const SOURCE = "forexfactory";
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "muxAI-events-collector/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw)) throw new Error("expected array");

    const events: EventInput[] = [];
    for (const row of raw) {
      const title = typeof row.title === "string" ? row.title : null;
      const date = typeof row.date === "string" ? row.date : null;
      const impactRaw = typeof row.impact === "string" ? row.impact.toLowerCase() : "low";
      const country = typeof row.country === "string" ? row.country.toUpperCase() : null;
      if (!title || !date) continue;

      // Drop currencies that don't meaningfully move crypto.
      if (!country || !CRYPTO_RELEVANT_CURRENCIES.has(country)) continue;

      const startsAt = new Date(date);
      if (Number.isNaN(startsAt.getTime())) continue;

      // Only carry High and Medium impact events to keep noise low.
      const importance: "high" | "medium" | "low" =
        impactRaw === "high" ? "high" : impactRaw === "medium" ? "medium" : "low";
      if (importance === "low") continue;

      events.push({
        source: SOURCE,
        sourceId: `${country ?? "??"}|${title}|${startsAt.toISOString()}`,
        kind: "macro",
        asset: null,
        title: country ? `[${country}] ${title}` : title,
        description: typeof row.forecast === "string" ? `Forecast: ${row.forecast}, Previous: ${row.previous ?? "n/a"}` : null,
        importance,
        startsAt,
        endsAt: null,
        metadata: { country, forecast: row.forecast, previous: row.previous, raw_impact: row.impact },
      });
    }
    return { source: SOURCE, events };
  } catch (err) {
    return { source: SOURCE, events: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Deribit — BTC/ETH options expiries ──────────────────────────────────────
async function fetchDeribitExpiries(): Promise<FetchResult> {
  const SOURCE = "deribit";
  try {
    const out: EventInput[] = [];
    for (const currency of ["BTC", "ETH"]) {
      const res = await fetch(
        `https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`Deribit ${currency} HTTP ${res.status}`);
      const json = (await res.json()) as { result?: Array<{ expiration_timestamp: number }> };
      if (!Array.isArray(json.result)) continue;

      // Group instruments by expiration; each unique expiry becomes one event.
      const byExpiry = new Map<number, number>();
      for (const inst of json.result) {
        if (typeof inst.expiration_timestamp !== "number") continue;
        byExpiry.set(inst.expiration_timestamp, (byExpiry.get(inst.expiration_timestamp) ?? 0) + 1);
      }

      const now = Date.now();
      const horizon = now + 14 * 24 * 60 * 60 * 1000; // next 14 days only
      for (const [ts, count] of byExpiry) {
        if (ts < now || ts > horizon) continue;
        const startsAt = new Date(ts);
        // Monthly expiry (last Friday of month) is the high-impact one. Heuristic:
        // friday + day-of-month >= 22.
        const isFriday = startsAt.getUTCDay() === 5;
        const isMonthly = isFriday && startsAt.getUTCDate() >= 22;
        const importance: "high" | "medium" | "low" = isMonthly ? "high" : isFriday ? "medium" : "low";
        if (importance === "low") continue;

        out.push({
          source: SOURCE,
          sourceId: `${currency}-expiry-${ts}`,
          kind: "options-expiry",
          asset: currency,
          title: `${currency} options expiry${isMonthly ? " (monthly)" : ""}`,
          description: `${count} ${currency} option contracts expire on Deribit`,
          importance,
          startsAt,
          endsAt: null,
          metadata: { currency, contractCount: count, isMonthly },
        });
      }
    }
    return { source: SOURCE, events: out };
  } catch (err) {
    return { source: SOURCE, events: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── DefiLlama — protocol hacks (recent + relevant) ──────────────────────────
// Hacks endpoint is the most stable free DefiLlama event-like source. Returns
// historical hacks with dates and amounts; we surface recent ones (<=7 days)
// as "context events" since the council should know about a fresh exploit on a
// related protocol when sizing risk.
async function fetchDefiLlamaHacks(): Promise<FetchResult> {
  const SOURCE = "defillama-hacks";
  try {
    const res = await fetch("https://api.llama.fi/hacks", {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "muxAI-events-collector/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw)) throw new Error("expected array");

    const events: EventInput[] = [];
    const now = Date.now();
    // 30-day window — hacks have a longer-tail news cycle than macro prints,
    // and an empty list otherwise leaves the council blind to recent context.
    const horizon = 30 * 24 * 60 * 60 * 1000;

    for (const row of raw) {
      const defillamaId = row.defillamaId ?? null;
      const name = typeof row.name === "string" ? row.name : null;
      const dateRaw = row.date;
      let ts: number | null = null;
      if (typeof dateRaw === "number") ts = dateRaw < 1e12 ? dateRaw * 1000 : dateRaw;
      else if (typeof dateRaw === "string") ts = new Date(dateRaw).getTime();
      if (!name || !ts || Number.isNaN(ts)) continue;
      if (now - ts > horizon || ts > now) continue;

      const amount = typeof row.amount === "number" ? row.amount : null;
      // Drop dust — anything under $1M isn't market-moving for major crypto.
      if (!amount || amount < 1_000_000) continue;

      const importance: "high" | "medium" | "low" =
        amount >= 50_000_000 ? "high" : amount >= 10_000_000 ? "medium" : "low";

      const chain = Array.isArray(row.chain) ? (row.chain as unknown[]).filter((c) => typeof c === "string").join(", ") : null;

      events.push({
        source: SOURCE,
        sourceId: defillamaId !== null ? `defillama-${defillamaId}` : `${name}-${ts}`,
        kind: "hack",
        asset: null,
        title: `Hack: ${name}${chain ? ` (${chain})` : ""}`,
        description: `~$${(amount / 1_000_000).toFixed(1)}M lost${row.technique ? ` — ${row.technique}` : ""}`,
        importance,
        startsAt: new Date(ts),
        endsAt: null,
        metadata: { amount, chain, technique: row.technique, classification: row.classification, targetType: row.targetType, returnedFunds: row.returnedFunds },
      });
    }
    return { source: SOURCE, events };
  } catch (err) {
    return { source: SOURCE, events: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// Append new fetchers here. Each must return FetchResult and never throw.
const SOURCE_FETCHERS = [fetchForexFactory, fetchDeribitExpiries, fetchDefiLlamaHacks];

async function upsertEvents(events: EventInput[]): Promise<number> {
  let upserted = 0;
  for (const e of events) {
    try {
      await prisma.event.upsert({
        where: { source_sourceId: { source: e.source, sourceId: e.sourceId } },
        create: {
          source: e.source,
          sourceId: e.sourceId,
          kind: e.kind,
          asset: e.asset ?? null,
          title: e.title,
          description: e.description ?? null,
          importance: e.importance,
          startsAt: e.startsAt,
          endsAt: e.endsAt ?? null,
          metadata: e.metadata ? (e.metadata as object) : undefined,
        },
        update: {
          title: e.title,
          description: e.description ?? null,
          importance: e.importance,
          startsAt: e.startsAt,
          endsAt: e.endsAt ?? null,
          metadata: e.metadata ? (e.metadata as object) : undefined,
          fetchedAt: new Date(),
        },
      });
      upserted++;
    } catch (err) {
      console.error(`[events-collector] upsert failed for ${e.source}/${e.sourceId}:`, err instanceof Error ? err.message : err);
    }
  }
  return upserted;
}

async function tickOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  reportTick(SCHEDULER_ID, { status: "running", lastTickAt: new Date() });

  try {
    const results = await Promise.all(SOURCE_FETCHERS.map((f) => f()));

    const allEvents = results.flatMap((r) => r.events);
    const upserted = await upsertEvents(allEvents);

    const errors = results.filter((r) => r.error);
    const sourceMeta: Record<string, unknown> = {};
    for (const r of results) {
      sourceMeta[r.source] = r.error ? `error: ${r.error}` : `${r.events.length} events`;
    }

    reportTick(SCHEDULER_ID, {
      status: errors.length === results.length ? "error" : "idle",
      lastError: errors.length === results.length ? "all sources failed" : errors.length > 0 ? `${errors.length}/${results.length} sources errored` : undefined,
      meta: { upsertedThisTick: upserted, totalSources: results.length, ...sourceMeta },
    });
  } catch (err) {
    console.error("[events-collector] tick failed:", err);
    reportTick(SCHEDULER_ID, { status: "error", lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    inFlight = false;
  }
}

export function initEventsCollector(): void {
  reportTick(SCHEDULER_ID, {
    kind: "events-collector",
    label: SCHEDULER_LABEL,
    schedule: SCHEDULER_SCHEDULE,
    status: "idle",
  });
  // First tick after a short delay so boot is clean and DB is ready.
  setTimeout(() => { tickOnce().catch(() => {}); }, 5_000);
  timer = setInterval(() => { tickOnce().catch(() => {}); }, TICK_MS);
  if (timer.unref) timer.unref();
  console.log("[events-collector] initialised — tick every 30m");
}

export function stopEventsCollector(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
