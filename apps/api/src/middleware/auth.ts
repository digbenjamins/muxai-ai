import type { Request, Response, NextFunction } from "express";
import { INTERNAL_SECRET } from "../services/internal-secret";

const API_KEY = process.env.API_KEY;

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  // If no API_KEY is configured, skip auth (dev convenience)
  if (!API_KEY) return next();

  // SSE endpoints — EventSource cannot send headers, exempt all /stream paths
  if (req.path.endsWith("/stream")) return next();

  // MCP servers authenticate via internal secret — let them through
  if (req.headers["x-muxai-internal"] === INTERNAL_SECRET) return next();

  const provided = req.headers["x-api-key"] as string | undefined;
  if (provided === API_KEY) return next();

  res.status(401).json({ error: "Unauthorized" });
}
