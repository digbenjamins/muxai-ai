import cron from "node-cron";
import { prisma } from "../lib/db";
import { invokeAgent } from "./heartbeat";
import { reportTick, removeEntry } from "./scheduler-registry";

type ScheduledTask = cron.ScheduledTask;

// Active cron jobs keyed by agentId
const jobs = new Map<string, ScheduledTask>();

const heartbeatId = (agentId: string) => `heartbeat:${agentId}`;

export function getHeartbeatConfig(runtimeConfig: unknown): { enabled: boolean; cron: string } | null {
  if (!runtimeConfig || typeof runtimeConfig !== "object") return null;
  const cfg = (runtimeConfig as Record<string, unknown>).heartbeat;
  if (!cfg || typeof cfg !== "object") return null;
  const { enabled, cron: cronExpr } = cfg as Record<string, unknown>;
  if (!enabled || typeof cronExpr !== "string" || !cronExpr) return null;
  return { enabled: Boolean(enabled), cron: cronExpr };
}

async function scheduleAgent(agentId: string, cronExpr: string) {
  // Cancel existing job if any
  unscheduleAgent(agentId);

  if (!cron.validate(cronExpr)) {
    console.warn(`[scheduler] Invalid cron expression for agent ${agentId}: ${cronExpr}`);
    return;
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
  const label = `Heartbeat — ${agent?.name ?? agentId.slice(0, 8)}`;

  const task = cron.schedule(cronExpr, async () => {
    console.log(`[scheduler] Triggering scheduled heartbeat for agent ${agentId}`);
    reportTick(heartbeatId(agentId), { status: "running", lastTickAt: new Date() });
    try {
      const a = await prisma.agent.findUnique({ where: { id: agentId } });
      if (!a || a.status === "terminated" || a.status === "paused") {
        reportTick(heartbeatId(agentId), { status: "idle" });
        return;
      }
      if (a.status === "running") {
        console.log(`[scheduler] Agent ${agentId} already running, skipping`);
        reportTick(heartbeatId(agentId), { status: "idle", meta: { lastSkipReason: "already_running" } });
        return;
      }
      await invokeAgent(agentId);
      reportTick(heartbeatId(agentId), { status: "idle", lastError: undefined });
    } catch (err) {
      console.error(`[scheduler] Failed to invoke agent ${agentId}:`, err);
      reportTick(heartbeatId(agentId), { status: "error", lastError: err instanceof Error ? err.message : String(err) });
    }
  });

  jobs.set(agentId, task);
  reportTick(heartbeatId(agentId), { kind: "heartbeat", label, schedule: cronExpr, status: "idle" });
  console.log(`[scheduler] Scheduled agent ${agentId} with cron: ${cronExpr}`);
}

function unscheduleAgent(agentId: string) {
  const existing = jobs.get(agentId);
  if (existing) {
    existing.stop();
    jobs.delete(agentId);
    removeEntry(heartbeatId(agentId));
    console.log(`[scheduler] Unscheduled agent ${agentId}`);
  }
}

/** Call this when an agent's runtimeConfig or status changes. */
export async function syncAgentSchedule(agentId: string, runtimeConfig: unknown, status?: string) {
  if (status === "paused" || status === "terminated") {
    unscheduleAgent(agentId);
    return;
  }
  const heartbeat = getHeartbeatConfig(runtimeConfig);
  if (heartbeat?.enabled) {
    await scheduleAgent(agentId, heartbeat.cron);
  } else {
    unscheduleAgent(agentId);
  }
}

/** Boot: load all scheduled agents from DB and start their cron jobs. */
export async function initScheduler() {
  const agents = await prisma.agent.findMany({
    where: { status: { not: "terminated" } },
    select: { id: true, name: true, runtimeConfig: true },
  });

  let count = 0;
  for (const agent of agents) {
    const heartbeat = getHeartbeatConfig(agent.runtimeConfig);
    if (heartbeat?.enabled) {
      await scheduleAgent(agent.id, heartbeat.cron);
      count++;
    }
  }

  console.log(`[scheduler] Initialised — ${count} agent(s) scheduled`);
}
