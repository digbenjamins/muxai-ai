import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/db";

export const mcpServerRoutes = Router();

const MUXAI_IO_ROOT = path.resolve(process.cwd(), "../..");
const REGISTRY_PATH = path.join(MUXAI_IO_ROOT, "config/mcp-registry.json");

// GET /api/mcp-servers — built-in (from registry) + custom (from DB)
mcpServerRoutes.get("/", async (_req, res) => {
  try {
    const builtinServers = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    const customServers = await prisma.mcpServer.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ rootPath: MUXAI_IO_ROOT, servers: builtinServers, customServers });
  } catch {
    res.status(500).json({ error: "Failed to load MCP servers" });
  }
});

// POST /api/mcp-servers — add a custom MCP server
mcpServerRoutes.post("/", async (req, res) => {
  const { name, label, command, args, headers, description } = req.body as {
    name: string; label: string; command: string; args?: string[];
    headers?: Record<string, string>; description?: string;
  };

  if (!name || !label || !command) {
    res.status(400).json({ error: "name, label, and command are required" });
    return;
  }

  const server = await prisma.mcpServer.create({
    data: { name, label, command, args: args ?? [], headers: headers ?? undefined, description },
  });
  res.status(201).json(server);
});

// DELETE /api/mcp-servers/:id — remove a custom MCP server
mcpServerRoutes.delete("/:id", async (req, res) => {
  await prisma.mcpServer.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
