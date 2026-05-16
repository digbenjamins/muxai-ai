"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CalendarClock, PlusCircle } from "lucide-react";
import type { Agent } from "@/lib/types";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InvokeButton } from "./[id]/invoke-button";
import { MemoryPill, MemoryResetButton, type MemoryStatus } from "./memory-pill";

const STORAGE_KEY = "agents:teamLeadsOnly";

function shortModel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-")[1] ?? model;
}

const ROLE_COLORS: Record<string, string> = {
  "ceo": "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "news-analyst": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "technical-analyst": "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  "analyst": "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  "engineer": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "general": "bg-slate-500/15 text-slate-400 border-slate-500/20",
};

function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? "bg-slate-500/15 text-slate-400 border-slate-500/20";
}

function AgentCard({ agent, memory }: { agent: Agent; memory?: MemoryStatus }) {
  const config = agent.adapterConfig as Record<string, unknown>;
  const rt = agent.runtimeConfig as Record<string, unknown>;
  const hb = rt?.heartbeat as { enabled?: boolean; cron?: string } | undefined;
  const model = shortModel((config.model as string) ?? "");
  const runCount = agent._count?.runs ?? 0;
  const reporterCount = agent.reports?.length ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card hover:bg-accent/20 transition-colors group">
      <Link href={`/agents/${agent.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold uppercase ${roleColor(agent.role)}`}>
            {agent.name.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold leading-none truncate">{agent.name}</p>
              <AgentStatusBadge status={agent.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{agent.title || agent.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {model && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">{model}</span>
          )}
          {hb?.enabled && (
            <span className="flex items-center gap-1 text-xs text-violet-400">
              <CalendarClock className="h-3 w-3" />
              Scheduled
            </span>
          )}
          {reporterCount > 0 && (
            <span className="text-xs text-amber-400">
              Team lead · {reporterCount}
            </span>
          )}
          {memory && <MemoryPill status={memory} />}
          <span className="text-xs text-muted-foreground ml-auto">{runCount} run{runCount !== 1 ? "s" : ""}</span>
        </div>
      </Link>

      <div className="border-t border-border px-4 py-2.5 flex items-center gap-2">
        {agent.status !== "terminated" && <InvokeButton agentId={agent.id} size="sm" />}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground text-xs h-7">
          <Link href={`/agents/${agent.id}/edit`}>Edit</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground text-xs h-7">
          <Link href={`/agents/${agent.id}/runs`}>Runs</Link>
        </Button>
        {memory && <MemoryResetButton agentId={agent.id} agentName={agent.name} status={memory} />}
        {agent.status === "running" && (
          <Button asChild variant="ghost" size="sm" className="text-blue-400 text-xs h-7 ml-auto">
            <Link href={`/agents/${agent.id}/runs`}>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              Live
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function AgentsList({ agents, memoryMap }: { agents: Agent[]; memoryMap: Record<string, MemoryStatus> }) {
  const [teamLeadsOnly, setTeamLeadsOnly] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setTeamLeadsOnly(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);

  function toggle(next: boolean) {
    setTeamLeadsOnly(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  const teamLeadCount = agents.filter((a) => (a.reports?.length ?? 0) > 0).length;
  const visible = hydrated && teamLeadsOnly
    ? agents.filter((a) => (a.reports?.length ?? 0) > 0)
    : agents;

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Bot className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No agents yet</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first agent to get started</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/agents/new">
            <PlusCircle className="h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <Switch checked={teamLeadsOnly} onCheckedChange={toggle} aria-label="Show team leads only" />
          <span>Team leads only{teamLeadCount > 0 && <span className="ml-1 text-foreground">({teamLeadCount})</span>}</span>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No team leads</p>
          <p className="text-xs text-muted-foreground mt-1">No agents currently have reporters.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => <AgentCard key={a.id} agent={a} memory={memoryMap[a.id]} />)}
        </div>
      )}
    </>
  );
}
