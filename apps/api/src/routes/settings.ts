import { Router } from "express";
import { prisma } from "../lib/db";

export const settingsRoutes = Router();

// GET /api/settings — all settings as { key: value }
settingsRoutes.get("/", async (_req, res) => {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json(map);
});

// PATCH /api/settings — { key: value, ... }
settingsRoutes.patch("/", async (req, res) => {
  const updates = req.body as Record<string, string>;
  await Promise.all(
    Object.entries(updates).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );
  const rows = await prisma.setting.findMany();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});
