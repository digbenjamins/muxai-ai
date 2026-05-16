import Link from "next/link";
import { Bot, PlusCircle, CalendarClock, AlertTriangle, Brain } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { type MemoryStatus } from "./memory-pill";
import { AgentsList } from "./agents-list";

async function getAgents(): Promise<Agent[]> {
  try { return await apiFetch<Agent[]>("/api/agents"); } catch { return []; }
}

async function getMemorySummary(): Promise<Record<string, MemoryStatus>> {
  try { return await apiFetch<Record<string, MemoryStatus>>("/api/agents/memory-summary"); } catch { return {}; }
}

function driftRank(memory?: MemoryStatus): number {
  if (!memory?.enabled) return 0;
  if (!memory.hasSession) return 1;
  if (memory.runsSinceReset > 20) return 3;
  return 2;
}

export default async function AgentsPage() {
  const [agents, memoryMap] = await Promise.all([getAgents(), getMemorySummary()]);

  const active = agents.filter((a) => a.status !== "terminated");
  const errored = agents.filter((a) => a.status === "error");
  const scheduled = agents.filter((a) => {
    const rt = a.runtimeConfig as Record<string, unknown>;
    return (rt?.heartbeat as { enabled?: boolean } | undefined)?.enabled;
  });
  const memoryOn = agents.filter((a) => memoryMap[a.id]?.enabled);
  const drifting = memoryOn.filter((a) => (memoryMap[a.id]?.runsSinceReset ?? 0) > 20);

  const sortedAgents = [...agents].sort((a, b) => driftRank(memoryMap[b.id]) - driftRank(memoryMap[a.id]));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-none">Agents</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {active.length} active · {agents.length} total
              {errored.length > 0 && (
                <span className="ml-2 text-red-400 inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{errored.length} error{errored.length > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/agents/new">
            <PlusCircle className="h-4 w-4" />
            New Agent
          </Link>
        </Button>
      </div>

      {/* Summary strip */}
      {agents.length > 0 && (
        <div className="flex items-center gap-6 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="text-foreground font-medium">{agents.length}</span>
            agent{agents.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-foreground font-medium">{scheduled.length}</span>
            scheduled
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-foreground font-medium">{memoryOn.length}</span>
            with memory on
          </span>
          {drifting.length > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400 ml-auto">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">{drifting.length}</span>
              drifting — consider resetting
            </span>
          )}
        </div>
      )}

      <AgentsList agents={sortedAgents} memoryMap={memoryMap} />
    </div>
  );
}
