# mcp-events

Read-only MCP server exposing the muxAI events calendar to agents. Reads from
the `Event` table populated by the **events-collector** scheduler in
`apps/api/src/services/events-collector.ts`.

This MCP does **not** make external API calls — it queries the local muxAI
database. Ingestion is the collector's job, query is this MCP's job.

## Tools

| Tool                  | Purpose                                                        |
| :-------------------- | :------------------------------------------------------------- |
| `get_upcoming_events` | Calendar events between now and `window_hours` ahead.          |
| `get_recent_events`   | Events that already happened in the past `window_hours`.       |

Both return human-readable summaries plus the raw JSON payload so the agent can
reason structurally if needed.

## Sources currently wired

The collector ships with three free, no-API-key sources out of the box:

| Source              | What it provides                                          |
| :------------------ | :-------------------------------------------------------- |
| ForexFactory        | Macro econ calendar (FOMC, CPI, NFP, ECB, BoE) — High/Med |
| Deribit             | BTC/ETH options expiry dates (next 14 days)               |
| DefiLlama (hacks)   | Recent protocol hacks (last 7 days, ≥$5M)                 |

All three are public endpoints — **no signup, no API keys, no per-user
configuration**. Resilient by design: if one source is down, the other two
still populate the table; cached events from the last successful tick remain
available.

## Adding a new source

The collector is source-pluggable. To add a new source:

1. **Write a fetcher** in `apps/api/src/services/events-collector.ts`. It must
   return `Promise<FetchResult>` where `FetchResult = { source, events, error? }`.
   It must **never throw** — wrap the body in try/catch and return `{ source,
   events: [], error }` on failure so a single broken source does not take down
   the others.
2. **Map the upstream rows to `EventInput`**:
   ```ts
   {
     source: "your-source-id",      // unique short slug, also used in sourceId namespacing
     sourceId: "stable-dedup-key",  // upserted on conflict — pick something stable
     kind: "macro" | "unlock" | "options-expiry" | "hack" | "raise" | "...",
     asset: "BTC" | "ETH" | null,   // null for asset-agnostic events (macro)
     title: "Human readable",
     description: "Optional one-liner",
     importance: "high" | "medium" | "low",
     startsAt: new Date(...),
     endsAt: optional Date,
     metadata: { ...raw fields you want to preserve },
   }
   ```
3. **Append the fetcher** to `SOURCE_FETCHERS` at the bottom of the file.
4. **Restart the API.** The first tick fires 5s after boot; subsequent ticks
   every 30 minutes.

That's it. No schema migrations needed — the `Event` table is generic enough
to fit any source. No collector changes beyond your fetcher and the array
append.

## Importance ratings

The MCP filters by importance:

- **high**: Powell speaking, FOMC rate decision, large unlocks, ≥$50M hacks
- **medium**: weekly opt expiry, mid-tier macro prints, ≥$5M hacks
- **low**: noise — the collector drops these at fetch time, not stored

Pick `importance` thresholds in your fetcher conservatively. If everything is
"high", nothing is.

## Why a collector + DB instead of on-demand fetching?

Three reasons:

1. **Ingest once, query many.** A 5-agent council triggers 1 fetch (the
   scheduled tick), not 5 per cycle.
2. **Historical queries.** Events become a time series — you can ask "what
   events happened during this trade?" not just "what's coming up?".
3. **Resilience.** When a source is flaky right now, the DB still has
   yesterday's snapshot and the council degrades gracefully.

## Endpoints consumed

This MCP reads from the muxAI API:

- `GET /api/events/upcoming?window_hours=&asset=&importance=`
- `GET /api/events/recent?window_hours=`

Both authenticated via `MUXAI_INTERNAL_SECRET` (set automatically when the MCP
is spawned by an agent).
