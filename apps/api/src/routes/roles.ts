import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";

export const roleRoutes = Router();

const CreateRoleSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().optional(),
});

// GET /api/roles
roleRoutes.get("/", async (_req, res) => {
  const roles = await prisma.agentRole.findMany({ orderBy: { name: "asc" } });
  res.json(roles);
});

// POST /api/roles
roleRoutes.post("/", async (req, res) => {
  const parsed = CreateRoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  try {
    const role = await prisma.agentRole.create({ data: parsed.data });
    res.status(201).json(role);
  } catch {
    res.status(409).json({ error: "A role with that name already exists" });
  }
});

// DELETE /api/roles/:id
roleRoutes.delete("/:id", async (req, res) => {
  await prisma.agentRole.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
