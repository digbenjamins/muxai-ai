#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

function getApiUrl() { return process.env.MUXAI_API_URL || "http://localhost:3001"; }
function internalHeaders() {
  const secret = process.env.MUXAI_INTERNAL_SECRET;
  return secret ? { "x-muxai-internal": secret } : {};
}
function log(msg) { process.stderr.write(`[events] ${msg}\n`); }

async function fetchEvents(path) {
  const url = `${getApiUrl()}${path}`;
  const res = await fetch(url, { headers: internalHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function formatEvent(e) {
  const when = new Date(e.startsAt).toISOString().replace(".000Z", "Z");
  const imp = e.importance === "high" ? "🔴 HIGH" : e.importance === "medium" ? "🟡 MED" : "low";
  const tag = e.asset ? `[${e.asset}]` : `[${e.kind}]`;
  const desc = e.description ? ` — ${e.description}` : "";
  return `${when} | ${imp} | ${tag} ${e.title}${desc}`;
}

const server = new Server(
  { name: "events", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_upcoming_events",
      description:
        "Get upcoming calendar events that may impact trading decisions. " +
        "Combines macro events (FOMC, CPI, NFP, ECB), crypto-native events (token unlocks, options expiries), " +
        "and asset-specific events. Use BEFORE making a trade decision to ensure you are not entering ahead of high-impact news. " +
        "Returns events sorted by start time.",
      inputSchema: {
        type: "object",
        properties: {
          window_hours: { type: "number", description: "Time horizon in hours (1-720). Default 48.", default: 48 },
          asset: { type: "string", description: "Optional asset filter, e.g. \"BTC\" or \"ETH\". Macro events are always included regardless of asset." },
          importance: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Minimum importance level. \"high\" = only High impact. \"medium\" = High + Medium. Default = all.",
          },
        },
      },
    },
    {
      name: "get_recent_events",
      description:
        "Get events that already happened in the recent past (e.g. last 24h hacks, expired options). " +
        "Useful for retrospective analysis: \"did this trade fail because of an event we missed?\" " +
        "Returns events sorted by start time (most recent first).",
      inputSchema: {
        type: "object",
        properties: {
          window_hours: { type: "number", description: "How many hours back to look (1-720). Default 24.", default: 24 },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (name === "get_upcoming_events") {
    try {
      const params = new URLSearchParams();
      if (args.window_hours) params.set("window_hours", String(args.window_hours));
      if (args.asset) params.set("asset", String(args.asset));
      if (args.importance) params.set("importance", String(args.importance));
      const data = await fetchEvents(`/api/events/upcoming?${params.toString()}`);

      if (!data.events || data.events.length === 0) {
        return { content: [{ type: "text", text: `No upcoming events in the next ${data.window_hours}h${args.asset ? ` for ${args.asset}` : ""}.` }] };
      }

      const lines = [
        `Upcoming events (next ${data.window_hours}h${args.asset ? `, asset: ${args.asset}` : ""}${args.importance ? `, ≥${args.importance}` : ""}):`,
        ...data.events.map(formatEvent),
        "",
        `${data.count} event(s) returned. Use this list to gate trade entries around high-impact times.`,
      ];

      return {
        content: [{ type: "text", text: `${lines.join("\n")}\n\n${JSON.stringify(data.events)}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  if (name === "get_recent_events") {
    try {
      const params = new URLSearchParams();
      if (args.window_hours) params.set("window_hours", String(args.window_hours));
      const data = await fetchEvents(`/api/events/recent?${params.toString()}`);

      if (!data.events || data.events.length === 0) {
        return { content: [{ type: "text", text: `No events in the past ${data.window_hours}h.` }] };
      }

      const lines = [
        `Recent events (past ${data.window_hours}h):`,
        ...data.events.map(formatEvent),
      ];

      return {
        content: [{ type: "text", text: `${lines.join("\n")}\n\n${JSON.stringify(data.events)}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
log("ready");
