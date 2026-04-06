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

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return parseFloat(((current - previous) / previous * 100).toFixed(2));
}

function findClosest(entries, targetTime) {
  let closest = null;
  let minDiff = Infinity;
  for (const e of entries) {
    const diff = Math.abs(e.timestamp - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = e;
    }
  }
  return closest;
}

const VALID_PERIODS = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"];

function validatePeriod(period) {
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(`Invalid period "${period}". Valid: ${VALID_PERIODS.join(", ")}`);
  }
}

// --- MCP server --------------------------------------------------------------

const server = new Server(
  { name: "crypto-data", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_funding_rate",
      description:
        "Get the current funding rate for a crypto futures trading pair. " +
        "Returns the current rate, mark price, index price, and next funding time. " +
        "Funding rates indicate market sentiment: positive = longs pay shorts (bullish bias), " +
        "negative = shorts pay longs (bearish bias). " +
        "Extremely high or low rates often precede reversals. " +
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
      name: "get_open_interest",
      description:
        "Get the current open interest for a crypto futures trading pair, " +
        "including 1-hour, 4-hour, and 24-hour change percentages. " +
        "Returns total outstanding contracts (base asset + notional USD) and how OI has shifted over time. " +
        "Rising OI with rising price = new longs entering (trend confirmation). " +
        "Rising OI with falling price = new shorts entering (bearish pressure). " +
        "Falling OI = positions closing (trend weakening). " +
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
      name: "get_long_short_ratio",
      description:
        "Get the global long/short account ratio for a crypto futures pair. " +
        "Shows the percentage of all accounts holding long vs short positions. " +
        "High long ratio = crowded long (potential squeeze risk). " +
        "High short ratio = crowded short (potential short squeeze). " +
        "Default: latest 30 entries at 1h intervals.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Futures trading pair, e.g. "BTCUSDT", "BTC/USDT"',
          },
          period: {
            type: "string",
            description: 'Time interval per data point. Options: "5m","15m","30m","1h","2h","4h","6h","12h","1d". Default "1h".',
            default: "1h",
          },
          limit: {
            type: "number",
            description: "Number of entries (1-500). Default 30.",
            default: 30,
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_top_trader_positions",
      description:
        "Get the long/short position ratio of the top 20% of traders (by margin balance) for a futures pair. " +
        "More reliable sentiment signal than global ratio since it reflects experienced traders. " +
        "Default: latest 30 entries at 1h intervals.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Futures trading pair, e.g. "BTCUSDT", "BTC/USDT"',
          },
          period: {
            type: "string",
            description: 'Time interval. Options: "5m","15m","30m","1h","2h","4h","6h","12h","1d". Default "1h".',
            default: "1h",
          },
          limit: {
            type: "number",
            description: "Number of entries (1-500). Default 30.",
            default: 30,
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_taker_buy_sell_volume",
      description:
        "Get the taker buy/sell volume ratio for a crypto futures pair. " +
        "Taker buys = aggressive buyers hitting the ask (bullish pressure). " +
        "Taker sells = aggressive sellers hitting the bid (bearish pressure). " +
        "A ratio above 1 means more aggressive buying, below 1 means more aggressive selling. " +
        "Default: latest 30 entries at 1h intervals.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Futures trading pair, e.g. "BTCUSDT", "BTC/USDT"',
          },
          period: {
            type: "string",
            description: 'Time interval. Options: "5m","15m","30m","1h","2h","4h","6h","12h","1d". Default "1h".',
            default: "1h",
          },
          limit: {
            type: "number",
            description: "Number of entries (1-500). Default 30.",
            default: 30,
          },
        },
        required: ["symbol"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // --- get_funding_rate ------------------------------------------------------
  if (name === "get_funding_rate") {
    const symbol = normalizeSymbol(args.symbol);
    try {
      const data = await binanceFutures("/fapi/v1/premiumIndex", { symbol });
      const rate = parseFloat(data.lastFundingRate);
      const markPrice = parseFloat(data.markPrice);
      const indexPrice = parseFloat(data.indexPrice);
      const nextFundingTime = new Date(data.nextFundingTime).toISOString();

      const summary = [
        `${symbol} | Binance Futures`,
        `Funding Rate: ${(rate * 100).toFixed(4)}% (${rate >= 0 ? "longs pay shorts" : "shorts pay longs"})`,
        `Mark Price: ${markPrice}`,
        `Index Price: ${indexPrice}`,
        `Next Funding: ${nextFundingTime}`,
      ].join("\n");

      return {
        content: [{
          type: "text",
          text: `${summary}\n\n${JSON.stringify({
            symbol,
            fundingRate: rate,
            fundingRatePercent: parseFloat((rate * 100).toFixed(4)),
            markPrice,
            indexPrice,
            nextFundingTime,
          })}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  // --- get_open_interest -----------------------------------------------------
  if (name === "get_open_interest") {
    const symbol = normalizeSymbol(args.symbol);
    try {
      const [oiData, premium] = await Promise.all([
        binanceFutures("/fapi/v1/openInterest", { symbol }),
        binanceFutures("/fapi/v1/premiumIndex", { symbol }),
      ]);

      const currentOi = parseFloat(oiData.openInterest);
      const markPrice = parseFloat(premium.markPrice);
      const notionalUsd = currentOi * markPrice;
      const now = Date.now();

      const history = await binanceFutures("/futures/data/openInterestHist", {
        symbol,
        period: "5m",
        limit: "288",
      });

      const entries = history.map((d) => ({
        timestamp: d.timestamp,
        oi: parseFloat(d.sumOpenInterest),
        notional: parseFloat(d.sumOpenInterestValue),
      }));

      const h1 = findClosest(entries, now - 1 * 60 * 60 * 1000);
      const h4 = findClosest(entries, now - 4 * 60 * 60 * 1000);
      const h24 = findClosest(entries, now - 24 * 60 * 60 * 1000);

      const change1h = h1 ? pctChange(currentOi, h1.oi) : null;
      const change4h = h4 ? pctChange(currentOi, h4.oi) : null;
      const change24h = h24 ? pctChange(currentOi, h24.oi) : null;

      const fmt = (v) => v !== null ? `${v >= 0 ? "+" : ""}${v}%` : "n/a";
      const base = symbol.replace("USDT", "");

      const summary = [
        `${symbol} | Binance Futures`,
        `Open Interest: ${fmtNum(currentOi, 3)} ${base}`,
        `Notional: $${fmtNum(notionalUsd, 0)}`,
        `Mark Price: ${markPrice}`,
        ``,
        `Change:  1h ${fmt(change1h)}  |  4h ${fmt(change4h)}  |  24h ${fmt(change24h)}`,
      ].join("\n");

      return {
        content: [{
          type: "text",
          text: `${summary}\n\n${JSON.stringify({
            symbol,
            openInterest: currentOi,
            notionalUsd: parseFloat(notionalUsd.toFixed(2)),
            markPrice,
            change1h,
            change4h,
            change24h,
            time: new Date(oiData.time).toISOString(),
          })}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  // --- get_long_short_ratio --------------------------------------------------
  if (name === "get_long_short_ratio") {
    const symbol = normalizeSymbol(args.symbol);
    const period = args.period || "1h";
    const limit = Math.max(1, Math.min(500, args.limit || 30));
    try {
      validatePeriod(period);
      const data = await binanceFutures("/futures/data/globalLongShortAccountRatio", {
        symbol,
        period,
        limit: String(limit),
      });

      const entries = data.map((d) => ({
        time: new Date(d.timestamp).toISOString(),
        longShortRatio: parseFloat(d.longShortRatio),
        longAccount: parseFloat(d.longAccount),
        shortAccount: parseFloat(d.shortAccount),
      }));

      const latest = entries[entries.length - 1];
      const oldest = entries[0];
      const ratioChange = parseFloat((latest.longShortRatio - oldest.longShortRatio).toFixed(4));

      const summary = [
        `${symbol} Global Long/Short Ratio | Binance Futures | ${period}`,
        `Latest: ${latest.longShortRatio.toFixed(4)} (Long ${(latest.longAccount * 100).toFixed(1)}% / Short ${(latest.shortAccount * 100).toFixed(1)}%)`,
        `Trend: ${ratioChange >= 0 ? "+" : ""}${ratioChange} over ${entries.length} periods`,
        `${latest.longAccount > 0.5 ? "Majority long" : latest.shortAccount > 0.5 ? "Majority short" : "Balanced"}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(entries)}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  // --- get_top_trader_positions ----------------------------------------------
  if (name === "get_top_trader_positions") {
    const symbol = normalizeSymbol(args.symbol);
    const period = args.period || "1h";
    const limit = Math.max(1, Math.min(500, args.limit || 30));
    try {
      validatePeriod(period);
      const data = await binanceFutures("/futures/data/topLongShortPositionRatio", {
        symbol,
        period,
        limit: String(limit),
      });

      const entries = data.map((d) => ({
        time: new Date(d.timestamp).toISOString(),
        longShortRatio: parseFloat(d.longShortRatio),
        longAccount: parseFloat(d.longAccount),
        shortAccount: parseFloat(d.shortAccount),
      }));

      const latest = entries[entries.length - 1];
      const oldest = entries[0];
      const ratioChange = parseFloat((latest.longShortRatio - oldest.longShortRatio).toFixed(4));

      const summary = [
        `${symbol} Top Trader Positions | Binance Futures | ${period}`,
        `Latest: ${latest.longShortRatio.toFixed(4)} (Long ${(latest.longAccount * 100).toFixed(1)}% / Short ${(latest.shortAccount * 100).toFixed(1)}%)`,
        `Trend: ${ratioChange >= 0 ? "+" : ""}${ratioChange} over ${entries.length} periods`,
        `Top 20% traders are ${latest.longAccount > 0.5 ? "net long" : latest.shortAccount > 0.5 ? "net short" : "balanced"}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(entries)}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  // --- get_taker_buy_sell_volume ---------------------------------------------
  if (name === "get_taker_buy_sell_volume") {
    const symbol = normalizeSymbol(args.symbol);
    const period = args.period || "1h";
    const limit = Math.max(1, Math.min(500, args.limit || 30));
    try {
      validatePeriod(period);
      const data = await binanceFutures("/futures/data/takerlongshortRatio", {
        symbol,
        period,
        limit: String(limit),
      });

      const entries = data.map((d) => ({
        time: new Date(d.timestamp).toISOString(),
        buySellRatio: parseFloat(d.buySellRatio),
        buyVol: parseFloat(d.buyVol),
        sellVol: parseFloat(d.sellVol),
      }));

      const latest = entries[entries.length - 1];
      const avgRatio = entries.reduce((s, e) => s + e.buySellRatio, 0) / entries.length;

      const summary = [
        `${symbol} Taker Buy/Sell Volume | Binance Futures | ${period}`,
        `Latest: ${latest.buySellRatio.toFixed(4)} (Buy ${fmtNum(latest.buyVol)} / Sell ${fmtNum(latest.sellVol)})`,
        `Avg ratio over ${entries.length} periods: ${avgRatio.toFixed(4)}`,
        `${latest.buySellRatio > 1 ? "Aggressive buying dominates" : latest.buySellRatio < 1 ? "Aggressive selling dominates" : "Balanced"}`,
      ].join("\n");

      return {
        content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(entries)}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
