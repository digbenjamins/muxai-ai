import { Router } from "express";
import { prisma } from "../lib/db";

export const eventRoutes = Router();

// GET /api/events/upcoming?window_hours=48&asset=BTC&importance=high
// Returns events whose startsAt is between now and now + window_hours.
eventRoutes.get("/upcoming", async (req, res) => {
  const windowHours = Math.min(Math.max(Number(req.query.window_hours) || 48, 1), 720);
  const asset = typeof req.query.asset === "string" && req.query.asset.length > 0 ? req.query.asset.toUpperCase() : null;
  const importance = typeof req.query.importance === "string" && ["high", "medium", "low"].includes(req.query.importance)
    ? (req.query.importance as "high" | "medium" | "low")
    : null;

  const now = new Date();
  const horizon = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    startsAt: { gte: now, lte: horizon },
  };
  if (asset) {
    // Match the requested asset OR macro events (asset is null) — macro affects everything.
    where.OR = [{ asset }, { asset: null }];
  }
  if (importance === "high") where.importance = "high";
  else if (importance === "medium") where.importance = { in: ["high", "medium"] };
  // "low" or null: no importance filter

  try {
    const events = await prisma.event.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    res.json({ window_hours: windowHours, asset, importance, count: events.length, events });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load events" });
  }
});

// GET /api/events/recent?window_hours=24
// Returns events whose startsAt is in the past N hours (e.g. recent hacks).
eventRoutes.get("/recent", async (req, res) => {
  const windowHours = Math.min(Math.max(Number(req.query.window_hours) || 24, 1), 720);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  try {
    const events = await prisma.event.findMany({
      where: { startsAt: { gte: since, lte: new Date() } },
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    res.json({ window_hours: windowHours, count: events.length, events });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load events" });
  }
});
