import { Router, type Request } from "express";
import { prisma } from "../lib/db";
import { normalizeSymbol, getCandles } from "../services/candle-cache";

type RunIdReq = Request<{ runId: string }>;

// Watches live under a run (POST/GET) and are deleted individually by id.
//   POST   /api/runs/:runId/watches
//   GET    /api/runs/:runId/watches
//   DELETE /api/watches/:id
//
// We split into two routers so the run-scoped paths can be mounted under
// /api/runs alongside the existing runRoutes.

export const runWatchRoutes = Router({ mergeParams: true });
export const watchRoutes = Router();

function isDirection(v: unknown): v is "above" | "below" {
  return v === "above" || v === "below";
}

function isKind(v: unknown): v is "confirms" | "invalidates" {
  return v === "confirms" || v === "invalidates";
}

// Look up the most recent close so we can infer direction (above vs below)
// from the watch price alone. Tries a few common intervals before giving up.
async function latestCloseFor(symbol: string, intervalHint?: string | null): Promise<number | null> {
  const intervals = [intervalHint, "15m", "1h", "4h", "1d"].filter(
    (v, i, a): v is string => typeof v === "string" && v.length > 0 && a.indexOf(v) === i,
  );
  for (const interval of intervals) {
    try {
      const from = Date.now() - 24 * 3600 * 1000;
      const candles = await getCandles({ symbol, interval, from, limit: 1 });
      const last = candles[candles.length - 1];
      if (last && Number.isFinite(last.close)) return last.close;
    } catch {
      // try next interval
    }
  }
  return null;
}

runWatchRoutes.get("/", async (req: RunIdReq, res) => {
  const runId = String(req.params.runId);
  if (!runId) {
    res.status(400).json({ error: "runId required" });
    return;
  }
  const watches = await prisma.priceWatch.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ count: watches.length, watches });
});

runWatchRoutes.post("/", async (req: RunIdReq, res) => {
  const runId = String(req.params.runId);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const price = Number(body.price);
  const directionInput = body.direction;
  const kindInput = body.kind;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const intervalRaw = typeof body.interval === "string" ? body.interval.trim() : null;
  const symbolRaw = typeof body.symbol === "string" ? body.symbol.trim() : "";

  if (!runId) {
    res.status(400).json({ error: "runId required" });
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }
  if (label.length === 0) {
    res.status(400).json({ error: "label required" });
    return;
  }
  if (symbolRaw.length === 0) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  if (kindInput !== undefined && !isKind(kindInput)) {
    res.status(400).json({ error: "kind must be 'confirms' or 'invalidates'" });
    return;
  }

  const symbol = normalizeSymbol(symbolRaw);

  // Direction is the trigger contract (which side of the level fires the alert).
  // Prefer an explicit direction; otherwise infer from the latest close — a
  // watch above current price fires when high >= price ("above") and vice
  // versa. This keeps the UI simple (one less field) while preserving the
  // mechanics the watch-checker depends on.
  let direction: "above" | "below";
  if (isDirection(directionInput)) {
    direction = directionInput;
  } else {
    const last = await latestCloseFor(symbol, intervalRaw);
    if (last === null) {
      res.status(400).json({ error: "could not determine direction — no recent candles for this symbol" });
      return;
    }
    direction = price >= last ? "above" : "below";
  }

  const run = await prisma.heartbeatRun.findUnique({ where: { id: runId }, select: { id: true } });
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }

  const watch = await prisma.priceWatch.create({
    data: {
      runId,
      symbol,
      interval: intervalRaw,
      price,
      direction,
      kind: isKind(kindInput) ? kindInput : null,
      label,
    },
  });
  res.status(201).json({ watch });
});

// GET /api/watches?status=active,triggered — global list across all runs.
// The terminal panel queries this to show both still-armed alerts and recent
// hits (so a fire doesn't silently disappear). Accepts a single status or a
// comma-separated list; unknown values are filtered out.
watchRoutes.get("/", async (req, res) => {
  const statusQ = typeof req.query.status === "string" ? req.query.status : null;
  const allowed = new Set(["active", "triggered", "cancelled"]);
  const statuses = statusQ
    ? statusQ.split(",").map((s) => s.trim()).filter((s) => allowed.has(s))
    : [];
  const where = statuses.length > 0 ? { status: { in: statuses } } : {};
  const watches = await prisma.priceWatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ count: watches.length, watches });
});

watchRoutes.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.priceWatch.delete({ where: { id } });
    res.status(204).end();
  } catch {
    // Prisma throws if not found — treat that as 404 idempotently.
    res.status(404).json({ error: "watch not found" });
  }
});
