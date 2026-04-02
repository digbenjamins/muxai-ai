#!/usr/bin/env node
import { XMLParser } from "fast-xml-parser";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
  { name: "Blockworks", url: "https://blockworks.co/feed" },
  { name: "Bitcoin Sistemi", url: "https://en.bitcoinsistemi.com/feed/" },
  { name: "AMBCrypto", url: "https://ambcrypto.com/feed/" },
  { name: "Cryptopolitan", url: "https://www.cryptopolitan.com/feed/" },
];

const CURRENCY_TERMS = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth", "ether"],
  SOL: ["solana", "sol"],
  BNB: ["binance", "bnb"],
  XRP: ["ripple", "xrp"],
  ADA: ["cardano", "ada"],
  DOGE: ["dogecoin", "doge"],
  AVAX: ["avalanche", "avax"],
  DOT: ["polkadot", "dot"],
  MATIC: ["polygon", "matic"],
  LINK: ["chainlink", "link"],
  UNI: ["uniswap", "uni"],
  ATOM: ["cosmos", "atom"],
  LTC: ["litecoin", "ltc"],
  SHIB: ["shiba", "shib"],
  PEPE: ["pepe"],
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRss(xml, sourceName) {
  const parsed = parser.parse(xml);
  if (parsed?.rss?.channel) {
    return toArray(parsed.rss.channel.item).map((item) => ({
      title: item.title?.toString().trim() ?? "",
      url: item.link?.toString().trim() ?? "",
      source: sourceName,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      summary: stripHtml(item.description?.toString() ?? "").slice(0, 300),
    }));
  }
  if (parsed?.feed?.entry) {
    return toArray(parsed.feed.entry).map((entry) => {
      const link = typeof entry.link === "string" ? entry.link : (entry.link?.["@_href"] ?? "");
      return {
        title: entry.title?.toString().trim() ?? "",
        url: link.trim(),
        source: sourceName,
        published_at: entry.published ? new Date(entry.published).toISOString() : null,
        summary: stripHtml((entry.summary ?? entry.content ?? "").toString()).slice(0, 300),
      };
    });
  }
  return [];
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; muxai-news-analyst/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return parseRss(await res.text(), feed.name);
  } catch {
    return [];
  }
}

async function fetchNews(currency, limit) {
  const symbol = currency.toUpperCase();
  const terms = CURRENCY_TERMS[symbol] ?? [symbol.toLowerCase()];
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const seen = new Set();
  return results
    .flat()
    .filter((a) => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      const haystack = `${a.title} ${a.summary}`.toLowerCase();
      return terms.some((t) => haystack.includes(t));
    })
    .sort((a, b) => {
      const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
      const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

const server = new Server({ name: "news-analyst", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_crypto_news",
      description:
        "Fetch recent news articles for a cryptocurrency from multiple sources " +
        "(CoinDesk, CoinTelegraph, Decrypt, The Block, Blockworks, Bitcoin Sistemi, AMBCrypto, Cryptopolitan). " +
        "Returns titles, URLs, sources, and publication dates. " +
        "Use this to gauge market sentiment before making a trade decision.",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: 'Cryptocurrency symbol, e.g. "BTC", "ETH", "SOL"' },
          limit: { type: "number", description: "Number of articles to return (default: 50, max: 100)", default: 50 },
        },
        required: ["currency"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_crypto_news") throw new Error(`Unknown tool: ${request.params.name}`);
  const { currency, limit = 50 } = request.params.arguments;
  const clampedLimit = Math.min(Math.max(1, Number(limit)), 100);
  try {
    const articles = await fetchNews(currency, clampedLimit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ currency: currency.toUpperCase(), sources: FEEDS.map((f) => f.name), count: articles.length, articles }, null, 2),
        },
      ],
    };
  } catch (err) {
    return { content: [{ type: "text", text: `Error fetching news: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
