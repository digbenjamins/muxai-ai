import Link from "next/link";
import { notFound } from "next/navigation";
import { History, ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { Agent, HeartbeatRun } from "@/lib/types";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Card, CardContent } from "@/components/ui/card";

async function getAgent(id: string): Promise<Agent | null> {
  try { return await apiFetch<Agent>(`/api/agents/${id}`); } catch { return null; }
}
async function getRuns(id: string): Promise<HeartbeatRun[]> {
  try { return await apiFetch<HeartbeatRun[]>(`/api/agents/${id}/runs`); } catch { return []; }
}

export default async function RunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [agent, runs] = await Promise.all([getAgent(id), getRuns(id)]);
  if (!agent) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <Link href={`/agents/${agent.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />{agent.name}
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 shrink-0">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-none">Run History</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{runs.length} run{runs.length !== 1 ? "s" : ""} total</p>
          </div>
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link key={run.id} href={`/agents/${agent.id}/runs/${run.id}`} className="block">
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs text-muted-foreground font-mono">{run.id.slice(0, 8)}…</span>
                    <span className="text-xs text-muted-foreground">{run.invocationSource}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</div>
                    {run.finishedAt && run.startedAt && (
                      <div>{Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
