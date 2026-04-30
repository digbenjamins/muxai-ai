// In-memory registry of background loops running in this API process.
// Each scheduler reports its status here so /api/schedulers can surface them.

export type SchedulerKind = "heartbeat" | "trade-resolver" | "telegram" | "events-collector";
export type SchedulerStatus = "idle" | "running" | "error";

export interface SchedulerEntry {
  id: string;              // unique key, e.g. "heartbeat:<agentId>", "trade-resolver", "telegram:<agentId>"
  kind: SchedulerKind;
  label: string;
  schedule: string;        // cron expr or "60s" or "polling"
  status: SchedulerStatus;
  registeredAt: Date;
  lastTickAt?: Date;
  lastError?: string;
  meta?: Record<string, unknown>;
}

const entries = new Map<string, SchedulerEntry>();

export function reportTick(id: string, patch: Partial<Omit<SchedulerEntry, "id" | "registeredAt">>): void {
  const existing = entries.get(id);
  if (!existing) {
    if (!patch.kind || !patch.label || !patch.schedule) {
      // First report must include the bootstrapping fields.
      throw new Error(`scheduler-registry: first reportTick("${id}") must include kind/label/schedule`);
    }
    entries.set(id, {
      id,
      kind: patch.kind,
      label: patch.label,
      schedule: patch.schedule,
      status: patch.status ?? "idle",
      registeredAt: new Date(),
      lastTickAt: patch.lastTickAt,
      lastError: patch.lastError,
      meta: patch.meta,
    });
    return;
  }
  entries.set(id, {
    ...existing,
    ...patch,
    meta: patch.meta ? { ...(existing.meta ?? {}), ...patch.meta } : existing.meta,
  });
}

export function removeEntry(id: string): void {
  entries.delete(id);
}

export function listSchedulers(): SchedulerEntry[] {
  return Array.from(entries.values()).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
}
