import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { isInternalRequest } from "../services/internal-secret";

const PUBLIC_SELECT = { id: true, name: true, description: true, provider: true, model: true, baseUrl: true, status: true, createdAt: true } as const;

export const contractorRoutes = Router();

const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
  provider: z.string().default("openrouter"),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().url().default("https://openrouter.ai/api/v1"),
});

const UpdateSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  description: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

// GET /api/contractors
contractorRoutes.get("/", async (_req, res) => {
  const contractors = await prisma.contractor.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, description: true, provider: true, model: true, baseUrl: true, status: true, createdAt: true },
  });
  res.json(contractors);
});

// GET /api/contractors/:id
// Internal callers (MCP servers) send X-Muxai-Internal header to receive apiKey.
contractorRoutes.get("/:id", async (req, res) => {
  const contractor = await prisma.contractor.findFirst({
    where: { OR: [{ id: req.params.id }, { name: req.params.id }] },
  });
  if (!contractor) { res.status(404).json({ error: "Contractor not found" }); return; }
  if (isInternalRequest(req)) {
    res.json(contractor);
  } else {
    const { apiKey: _stripped, ...safe } = contractor;
    res.json(safe);
  }
});

// POST /api/contractors
contractorRoutes.post("/", async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const contractor = await prisma.contractor.create({ data: parsed.data, select: PUBLIC_SELECT });
    res.status(201).json(contractor);
  } catch {
    res.status(409).json({ error: "A contractor with that name already exists" });
  }
});

// PATCH /api/contractors/:id
contractorRoutes.patch("/:id", async (req, res) => {
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const contractor = await prisma.contractor.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, name: true, description: true, provider: true, model: true, baseUrl: true, status: true, createdAt: true },
  });
  res.json(contractor);
});

// DELETE /api/contractors/:id
contractorRoutes.delete("/:id", async (req, res) => {
  await prisma.contractor.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
