#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// --- Helpers -----------------------------------------------------------------

function normalizeSymbol(symbol) {
  return symbol.toUpperCase().replace(/[\/\-]/g, "");
}

function fmtNum(n, decimals = 2) {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtPct(n) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtTime(ms) {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

async function binanceFutures(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://fapi.binance.com${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binance Futures ${res.status}: ${body}`);
  }
  return res.json();
}

function parseKline(k) {
  return {
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  };
}

async function getKlines(symbol, interval, limit) {
  const raw = await binanceFutures("/fapi/v1/klines", {
    symbol: normalizeSymbol(symbol),
    interval,
    limit: String(limit),
  });
  return raw.map(parseKline);
}

// --- Level resolution --------------------------------------------------------
// Canonical price-action liquidity levels, in strength order:
//   1. previous month's high/low      (closed 1M candle)
//   2. previous week's high/low       (closed 1w candle — Monday 00:00 UTC boundary)
//   3. current week's Monday high/low (closed daily, only if Monday has closed)
//   4. current week's developing high/low (max/min of closed dailies this week)

async function resolveLevels(symbol) {
  const [monthly, weekly, daily, hourly] = await Promise.all([
    getKlines(symbol, "1M", 3),
    getKlines(symbol, "1w", 3),
    getKlines(symbol, "1d", 14),
    getKlines(symbol, "1h", 1080), // ~45 days for sweep walking
  ]);

  // Binance returns oldest → newest; the last entry is the in-progress candle.
  const prevMonth = monthly[monthly.length - 2];
  const prevWeek = weekly[weekly.length - 2];
  const currentWeekStart = weekly[weekly.length - 1].openTime;

  const currentWeekDays = daily.filter((d) => d.openTime >= currentWeekStart);
  const mondayCandle = currentWeekDays[0];
  // closedWeekDays = all but the in-progress (latest) daily of the current week.
  const closedWeekDays = currentWeekDays.slice(0, -1);

  const currentPrice = hourly[hourly.length - 1].close;

  const levels = [];

  levels.push({
    id: "prev_month_high",
    label: "Previous Month High",
    price: prevMonth.high,
    side: "high",
    establishedAt: prevMonth.closeTime,
  });
  levels.push({
    id: "prev_month_low",
    label: "Previous Month Low",
    price: prevMonth.low,
    side: "low",
    establishedAt: prevMonth.closeTime,
  });
  levels.push({
    id: "prev_week_high",
    label: "Previous Week High",
    price: prevWeek.high,
    side: "high",
    establishedAt: prevWeek.closeTime,
  });
  levels.push({
    id: "prev_week_low",
    label: "Previous Week Low",
    price: prevWeek.low,
    side: "low",
    establishedAt: prevWeek.closeTime,
  });

  // Monday H/L only valid once Monday has closed.
  if (mondayCandle && mondayCandle.closeTime < Date.now()) {
    levels.push({
      id: "current_week_monday_high",
      label: "This Week's Monday High",
      price: mondayCandle.high,
      side: "high",
      establishedAt: mondayCandle.closeTime,
    });
    levels.push({
      id: "current_week_monday_low",
      label: "This Week's Monday Low",
      price: mondayCandle.low,
      side: "low",
      establishedAt: mondayCandle.closeTime,
    });
  }

  // Developing H/L = extremes of closed dailies in the current week.
  if (closedWeekDays.length > 0) {
    const devHigh = Math.max(...closedWeekDays.map((d) => d.high));
    const devLow = Math.min(...closedWeekDays.map((d) => d.low));
    const devHighDay = closedWeekDays.find((d) => d.high === devHigh);
    const devLowDay = closedWeekDays.find((d) => d.low === devLow);
    levels.push({
      id: "current_week_dev_high",
      label: "This Week's Developing High",
      price: devHigh,
      side: "high",
      establishedAt: devHighDay.closeTime,
    });
    levels.push({
      id: "current_week_dev_low",
      label: "This Week's Developing Low",
      price: devLow,
      side: "low",
      establishedAt: devLowDay.closeTime,
    });
  }

  for (const lvl of levels) {
    classifyLevel(lvl, hourly, currentPrice);
  }

  return { currentPrice, levels };
}

// Walk hourly candles after the level was established and tag it.
//   untouched      — no candle wicked beyond the level
//   wicked         — wicked beyond, price still beyond, no resolution yet
//   swept_reverted — wicked beyond AND a later candle closed back inside
//                    (the high-probability reversal trigger)
//   broken         — wicked beyond AND 2+ consecutive candles closed beyond
//                    (level flipped from liquidity to S/R)
// First sweep wins: once a level is swept_reverted, that status persists even
// if price later breaks the level — re-tests don't count per the methodology.
function classifyLevel(lvl, hourly, currentPrice) {
  const after = hourly.filter((c) => c.openTime > lvl.establishedAt);
  const beyond = lvl.side === "high"
    ? (c) => c.high > lvl.price
    : (c) => c.low < lvl.price;
  const closedBeyond = lvl.side === "high"
    ? (c) => c.close > lvl.price
    : (c) => c.close < lvl.price;
  const closedInside = lvl.side === "high"
    ? (c) => c.close < lvl.price
    : (c) => c.close > lvl.price;

  const firstWickIdx = after.findIndex(beyond);

  if (firstWickIdx === -1) {
    lvl.status = "untouched";
    lvl.sweptAt = null;
    lvl.wickDepth = null;
  } else {
    const subsequent = after.slice(firstWickIdx);
    const firstInsideClose = subsequent.find(closedInside);

    let consecBeyond = 0;
    let brokenAt = null;
    for (const c of subsequent) {
      if (closedBeyond(c)) {
        consecBeyond++;
        if (consecBeyond >= 2) {
          brokenAt = c.closeTime;
          break;
        }
      } else {
        consecBeyond = 0;
      }
    }

    if (firstInsideClose && (!brokenAt || firstInsideClose.closeTime < brokenAt)) {
      lvl.status = "swept_reverted";
      lvl.sweptAt = firstInsideClose.closeTime;
    } else if (brokenAt) {
      lvl.status = "broken";
      lvl.sweptAt = brokenAt;
    } else {
      lvl.status = "wicked";
      lvl.sweptAt = null;
    }

    const wickEnd = firstInsideClose
      ? subsequent.indexOf(firstInsideClose) + 1
      : subsequent.length;
    let maxOvershoot = 0;
    for (let i = 0; i < wickEnd; i++) {
      const c = subsequent[i];
      const o = lvl.side === "high" ? c.high - lvl.price : lvl.price - c.low;
      if (o > maxOvershoot) maxOvershoot = o;
    }
    lvl.wickDepth = maxOvershoot;
  }

  lvl.distancePct = ((currentPrice - lvl.price) / lvl.price) * 100;
}

// --- Formatting --------------------------------------------------------------

const STATUS_LABEL = {
  untouched: "🟢 fresh",
  wicked: "🟡 wicked (unresolved)",
  swept_reverted: "🔴 swept",
  broken: "⚫ broken",
};

function formatLevelLine(lvl) {
  const side = lvl.side === "high" ? "above" : "below";
  const dist = lvl.distancePct;
  const need = -dist;
  const distStr = lvl.side === "high"
    ? `${fmtPct(dist)} (need ${fmtPct(need)} to tag)`
    : `${fmtPct(dist)} (need ${fmtPct(need)} to tag)`;
  const sweptInfo = lvl.sweptAt ? ` — at ${fmtTime(lvl.sweptAt)}` : "";
  const wickInfo = lvl.wickDepth ? `, wick $${fmtNum(lvl.wickDepth)}` : "";
  return `${lvl.label}: $${fmtNum(lvl.price)} (${side}) — ${STATUS_LABEL[lvl.status]}${sweptInfo}${wickInfo} — current ${distStr}`;
}

function formatLevels(symbol, currentPrice, levels) {
  const lines = [];
  lines.push(`Liquidity Levels — ${symbol} @ $${fmtNum(currentPrice)}`);
  lines.push("");
  lines.push("Strength: prev month > prev week > this Monday > this week developing.");
  lines.push("First sweep + close back inside = high-probability reversal trigger.");
  lines.push("");
  for (const lvl of levels) {
    lines.push(`  • ${formatLevelLine(lvl)}`);
  }
  return lines.join("\n");
}

// --- MCP server --------------------------------------------------------------

const server = new Server(
  { name: "liquidity", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_liquidity_levels",
      description:
        "Get the canonical price-action liquidity levels for a Binance Futures pair: " +
        "previous month's high/low, previous week's high/low, the current week's Monday high/low, " +
        "and the current week's developing high/low (extremes of closed dailies so far this week). " +
        "Each level is tagged with sweep status: fresh (untouched), wicked (in progress), " +
        "swept (wicked + closed back inside — the high-probability reversal trigger), or broken " +
        "(wicked + closed beyond → level flipped from liquidity to S/R). " +
        "Only the FIRST sweep counts; re-tests are ignored. " +
        "Strength order: prev month > prev week > Monday > developing. " +
        'Symbol format: "BTCUSDT" or "BTC/USDT". Exchange: Binance Futures.',
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Futures trading pair, e.g. "BTCUSDT", "BTC/USDT", "ETHUSDT"',
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_recent_sweeps",
      description:
        "Return only the liquidity levels that have been SWEPT (wicked beyond and closed back inside) " +
        "within the lookback window. Each result is a high-probability reversal trigger per the " +
        "price-action liquidity methodology. Empty result = no recent sweeps.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Futures trading pair, e.g. "BTCUSDT"',
          },
          lookback_hours: {
            type: "number",
            description: "How far back to look for sweeps (1-720). Default 48.",
            default: 48,
          },
        },
        required: ["symbol"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const symbol = normalizeSymbol(args.symbol || "");
  if (!symbol) {
    return { content: [{ type: "text", text: "Error: symbol is required" }], isError: true };
  }

  try {
    if (name === "get_liquidity_levels") {
      const { currentPrice, levels } = await resolveLevels(symbol);
      return { content: [{ type: "text", text: formatLevels(symbol, currentPrice, levels) }] };
    }

    if (name === "get_recent_sweeps") {
      const lookbackHours = Number(args.lookback_hours ?? 48);
      const cutoff = Date.now() - lookbackHours * 3600 * 1000;
      const { currentPrice, levels } = await resolveLevels(symbol);
      const sweeps = levels.filter(
        (l) => l.status === "swept_reverted" && l.sweptAt >= cutoff
      );
      if (sweeps.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No sweeps in last ${lookbackHours}h for ${symbol}. Current price: $${fmtNum(currentPrice)}.`,
            },
          ],
        };
      }
      const lines = [];
      lines.push(`Recent sweeps for ${symbol} (last ${lookbackHours}h) — current $${fmtNum(currentPrice)}:`);
      lines.push("");
      for (const lvl of sweeps) {
        lines.push(`  • ${formatLevelLine(lvl)}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[liquidity] mcp server running\n");
