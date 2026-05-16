import { Router } from "express";
import { getCandles, intervalToMs, normalizeSymbol } from "../services/candle-cache";

export const candleRoutes = Router();

// GET /api/candles?symbol=BTCUSDT&interval=4h&since=<ms>&limit=200
// DB-first read with Binance gap-fill. The cache is shared with the resolver
// tick, so opportunistic fetches by either side fill a common store.
candleRoutes.get("/", async (req, res) => {
  const symbol = normalizeSymbol(String(req.query.symbol ?? ""));
  const interval = String(req.query.interval ?? "4h");
  const sinceQ = Number(req.query.since);
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);

  if (!symbol || !interval) {
    res.status(400).json({ error: "symbol and interval are required" });
    return;
  }
  const intervalMs = intervalToMs(interval);
  if (!intervalMs) {
    res.status(400).json({ error: `unsupported interval: ${interval}` });
    return;
  }

  // Default to `limit` bars back from now if `since` wasn't provided.
  const since = Number.isFinite(sinceQ) ? sinceQ : Date.now() - intervalMs * limit;

  try {
    const cached = await getCandles({ symbol, interval, from: since, limit });
    // lightweight-charts wants seconds for UTCTimestamp; keep the same shape
    // the web chart already consumes.
    const candles = cached.map((c) => ({
      time: Math.floor(c.openTime / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({ symbol, interval, candles });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to fetch candles" });
  }
});
