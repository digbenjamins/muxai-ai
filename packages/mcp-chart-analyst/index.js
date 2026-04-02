#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const MEDIA_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function detectMediaType(url) {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  return MEDIA_TYPES[ext] ?? "image/jpeg";
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; chart-analyst/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mediaType: detectMediaType(url),
  };
}

// --- MCP server ---

const server = new Server(
  { name: "chart-analyst", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "analyze_chart",
      description:
        "Fetch a trading chart image and return it so Claude can perform technical analysis. " +
        "Provide a publicly accessible image URL (PNG, JPG, WEBP). " +
        "Claude will identify trend direction, key support/resistance levels, chart patterns, " +
        "visible indicator readings, and give a short-term outlook. " +
        "Optionally include context such as the asset and timeframe.",
      inputSchema: {
        type: "object",
        properties: {
          image_url: {
            type: "string",
            description: "Publicly accessible URL of the chart image",
          },
          context: {
            type: "string",
            description:
              'Optional context, e.g. "BTC/USD 4h chart" or "looking for a short entry"',
          },
        },
        required: ["image_url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "analyze_chart") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { image_url, context } = request.params.arguments;

  try {
    const { base64, mediaType } = await fetchImageAsBase64(image_url);

    const contextNote = context ? `Context provided: ${context}\n\n` : "";

    return {
      content: [
        {
          type: "text",
          text: `${contextNote}Chart image fetched successfully. Please perform a full technical analysis covering: trend direction and strength, key support/resistance levels, any visible chart patterns (triangles, flags, H&S, etc.), indicator readings if visible (RSI, MACD, MAs, Bollinger Bands), notable candlestick signals, and a short-term outlook with potential trade setup.`,
        },
        {
          type: "image",
          data: base64,
          mimeType: mediaType,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error fetching chart: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
