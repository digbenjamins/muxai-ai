import Link from "next/link";
import { notFound } from "next/navigation";
import { History, ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { Agent, HeartbeatRun } from "@/lib/types";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { DecisionSummary } from "@/components/decision-summary";
import { OutcomeBadge, outcomeTone } from "@/components/outcome-badge";
import type { ResultCardConfig } from "@/lib/result-cards";

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

  const cardConfig = agent.adapterConfig?.resultCard as ResultCardConfig | undefined;

  const tally = runs.reduce(
    (acc, r) => {
      if (r.outcome) {
        const tone = outcomeTone(r.outcome);
        if (tone === "positive") acc.win++;
        else if (tone === "negative") acc.loss++;
        else acc.other++;
      } else if (r.resultJson) {
        acc.unmarked++;
      }
      return acc;
    },
    { win: 0, loss: 0, other: 0, unmarked: 0 },
  );
  const decided = tally.win + tally.loss;
  const hitRate = decided > 0 ? Math.round((tally.win / decided) * 100) : null;

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
        <>
          {decided + tally.other > 0 && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 px-4 text-sm">
                <div>
                  <span className="text-emerald-400 font-semibold">{tally.win}W</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-red-400 font-semibold">{tally.loss}L</span>
                  {hitRate !== null && (
                    <span className="text-muted-foreground ml-2">· {hitRate}% hit rate</span>
                  )}
                </div>
                {tally.other > 0 && <span className="text-xs text-muted-foreground">{tally.other} other</span>}
                {tally.unmarked > 0 && <span className="text-xs text-muted-foreground">{tally.unmarked} unmarked</span>}
              </CardContent>
            </Card>
          )}
          <div className="space-y-2">
            {runs.map((run) => (
              <Link key={run.id} href={`/agents/${agent.id}/runs/${run.id}`} className="block">
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                        <RunStatusBadge status={run.status} />
                        {run.resultJson && (
                          <DecisionSummary resultJson={run.resultJson} cardConfig={cardConfig} />
                        )}
                        {run.outcome && <OutcomeBadge outcome={run.outcome} fields={run.outcomeFields} />}
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</div>
                        {run.finishedAt && run.startedAt && (
                          <div className="mt-0.5">{Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s · {run.invocationSource}</div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
