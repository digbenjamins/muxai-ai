import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Bot } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { Agent, HeartbeatRun } from "@/lib/types";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvokeButton } from "./invoke-button";
import { StopButton } from "./stop-button";
import { PauseButton } from "./pause-button";
import { DeleteButton } from "./delete-button";
import { TeamPanel } from "./team-panel";
import { DefaultPromptPanel } from "./default-prompt-panel";
import { InvokeInfoPanel } from "./invoke-info-panel";
import { BehaviorInfoPanel } from "./behavior-info-panel";
import { RightColumn } from "./right-column";
import { DecisionSummary } from "@/components/decision-summary";
import { OutcomeBadge } from "@/components/outcome-badge";
import type { ResultCardConfig } from "@/lib/result-cards";

async function getAgent(id: string): Promise<Agent | null> {
  try {
    return await apiFetch<Agent>(`/api/agents/${id}`);
  } catch {
    return null;
  }
}

async function getRuns(id: string): Promise<HeartbeatRun[]> {
  try {
    return await apiFetch<HeartbeatRun[]>(`/api/agents/${id}/runs`);
  } catch {
    return [];
  }
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [agent, runs] = await Promise.all([getAgent(id), getRuns(id)]);
  if (!agent) notFound();

  const config = agent.adapterConfig as Record<string, unknown>;
  const runtime = agent.runtimeConfig as Record<string, unknown>;
  const heartbeat = runtime?.heartbeat as { enabled?: boolean; cron?: string } | undefined;
  const agentId = agent.id;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold leading-none">{agent.name}</h1>
              <AgentStatusBadge status={agent.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{agent.title || agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {agent.status !== "terminated" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/agents/${agentId}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          <PauseButton agentId={agentId} status={agent.status} hasSchedule={!!heartbeat?.enabled} />
          {agent.status === "running"
            ? <StopButton agentId={agentId} />
            : <InvokeButton agentId={agentId} disabled={agent.status === "terminated" || agent.status === "paused"} />
          }
          <DeleteButton agentId={agentId} agentName={agent.name} status={agent.status} runCount={agent._count?.runs ?? 0} />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 items-start">
        {/* Left column */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Identity</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Role" value={agent.role} />
                <Row label="Adapter" value={agent.adapterType} />
                <Row label="Model" value={String(config.model ?? "—")} />
                {agent.capabilities && <Row label="Capabilities" value={agent.capabilities} />}
                {agent.reportsTo && <Row label="Reports to" value={agent.reportsTo.name} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Stats</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Total runs" value={String(agent._count?.runs ?? 0)} />
                <Row label="Schedule" value={heartbeat?.enabled ? `${heartbeat.cron}` : "Manual only"} />
                <Row label="Created" value={new Date(agent.createdAt).toLocaleDateString()} />
                <Row label="Updated" value={new Date(agent.updatedAt).toLocaleDateString()} />
              </CardContent>
            </Card>
          </div>

          <DefaultPromptPanel agentId={agentId} adapterConfig={config} />
          {agent.reports.length > 0 && <TeamPanel reporters={agent.reports} />}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Recent Runs</h2>
              <Link href={`/agents/${agentId}/runs`} className="text-sm text-muted-foreground hover:underline">
                View all
              </Link>
            </div>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet. Invoke this agent to start.</p>
            ) : (
              <div className="space-y-2">
                {agent.status === "running" && runs[0]?.status === "running" && (
                  <Link href={`/agents/${agentId}/runs/${runs[0].id}`} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                    Live run — click to watch
                  </Link>
                )}
                {runs.slice(0, 5).map((run) => (
                  <Link key={run.id} href={`/agents/${agentId}/runs/${run.id}`} className="block">
                    <Card className="hover:shadow-sm transition-shadow">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                            <RunStatusBadge status={run.status} />
                            {run.resultJson && (
                              <DecisionSummary resultJson={run.resultJson} cardConfig={config.resultCard as ResultCardConfig | undefined} />
                            )}
                            {run.outcome && <OutcomeBadge outcome={run.outcome} fields={run.outcomeFields} />}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <RightColumn
          agentId={agentId}
          adapterConfig={config}
          promptTemplate={config.promptTemplate ? String(config.promptTemplate) : undefined}
          initialCardConfig={config.resultCard as ResultCardConfig | undefined}
          initialNotifyOn={(config.notifyOn ?? []) as string[]}
        />
      </div>

      <InvokeInfoPanel agentId={agentId} />
      <BehaviorInfoPanel />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
