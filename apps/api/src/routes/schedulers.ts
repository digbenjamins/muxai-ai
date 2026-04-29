import { Router } from "express";
import { listSchedulers } from "../services/scheduler-registry";

export const schedulerRoutes = Router();

// GET /api/schedulers — current snapshot of all background loops in this process
schedulerRoutes.get("/", (_req, res) => {
  res.json({ schedulers: listSchedulers() });
});
