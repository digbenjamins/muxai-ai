import { EventEmitter } from "node:events";

export type RunEvent =
  | { type: "log"; data: string }
  | { type: "done"; status: "succeeded" | "failed"; exitCode: number | null }
  | { type: "session"; sessionId: string };

export type GlobalLogEvent =
  | { type: "log"; agentId: string; agentName: string; runId: string; data: string; ts: number }
  | { type: "run_start"; agentId: string; agentName: string; runId: string; ts: number }
  | { type: "run_end"; agentId: string; agentName: string; runId: string; status: "succeeded" | "failed"; ts: number };

class RunEventBus extends EventEmitter {}

export const runEventBus = new RunEventBus();
runEventBus.setMaxListeners(100);

export const globalLogBus = new RunEventBus();
globalLogBus.setMaxListeners(100);

// Replay buffer — stores events per runId so late SSE subscribers don't miss early events
interface BufferedRun {
  events: RunEvent[];
  lastWriteAt: number;
}
const replayBuffers = new Map<string, BufferedRun>();
const ORPHAN_TTL_MS = 10 * 60 * 1000; // drop runs with no "done" after 10m of silence

function bufferEvent(runId: string, event: RunEvent) {
  let entry = replayBuffers.get(runId);
  if (!entry) {
    entry = { events: [], lastWriteAt: Date.now() };
    replayBuffers.set(runId, entry);
  }
  entry.events.push(event);
  entry.lastWriteAt = Date.now();
  // Clean up buffer 30s after run ends (happy path)
  if (event.type === "done") {
    setTimeout(() => replayBuffers.delete(runId), 30_000);
  }
}

// Sweep orphaned buffers (runs that never emitted "done" — crash, kill, restart)
setInterval(() => {
  const cutoff = Date.now() - ORPHAN_TTL_MS;
  for (const [runId, entry] of replayBuffers) {
    if (entry.lastWriteAt < cutoff) replayBuffers.delete(runId);
  }
}, 60_000).unref();

export function emitRunLog(runId: string, data: string) {
  const event = { type: "log", data } satisfies RunEvent;
  bufferEvent(runId, event);
  runEventBus.emit(`run:${runId}`, event);
}

export function emitRunDone(runId: string, status: "succeeded" | "failed", exitCode: number | null) {
  const event = { type: "done", status, exitCode } satisfies RunEvent;
  bufferEvent(runId, event);
  runEventBus.emit(`run:${runId}`, event);
}

export function emitRunSession(runId: string, sessionId: string) {
  const event = { type: "session", sessionId } satisfies RunEvent;
  bufferEvent(runId, event);
  runEventBus.emit(`run:${runId}`, event);
}

export function onRunEvent(runId: string, handler: (event: RunEvent) => void) {
  // Replay any buffered events immediately before subscribing to new ones
  const buffered = replayBuffers.get(runId)?.events ?? [];
  for (const event of buffered) handler(event);

  // If run already finished via replay, no need to subscribe
  if (buffered.some((e) => e.type === "done")) return () => {};

  runEventBus.on(`run:${runId}`, handler);
  return () => runEventBus.off(`run:${runId}`, handler);
}

export function emitGlobalLog(event: GlobalLogEvent) {
  globalLogBus.emit("log", event);
}

export function onGlobalLog(handler: (event: GlobalLogEvent) => void) {
  globalLogBus.on("log", handler);
  return () => globalLogBus.off("log", handler);
}
