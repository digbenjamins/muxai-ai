import Link from "next/link";
import { notFound } from "next/navigation";
import { Terminal, ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { HeartbeatRun } from "@/lib/types";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveLogs } from "@/components/live-logs";
import { RunResult } from "@/components/run-result";
import { OutcomePicker } from "@/components/outcome-picker";
import type { ResultCardConfig } from "@/lib/result-cards";

async function getRun(runId: string): Promise<HeartbeatRun | null> {
  try { return await apiFetch<HeartbeatRun>(`/api/runs/${runId}`); } catch { return null; }
}

async function getSiblingRuns(agentId: string): Promise<HeartbeatRun[]> {
  try { return await apiFetch<HeartbeatRun[]>(`/api/agents/${agentId}/runs`); } catch { return []; }
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const run = await getRun(runId);
  if (!run) notFound();

  const siblings = await getSiblingRuns(id);
  const pastLabels = Array.from(
    new Set(
      siblings
        .map((r) => r.outcome)
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0),
    ),
  );

  const duration =
    run.startedAt && run.finishedAt
      ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <Link href={`/agents/${id}/runs`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Run History
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-500/10 text-slate-400 shrink-0">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold leading-none font-mono">{run.id.slice(0, 8)}…</h1>
              <RunStatusBadge status={run.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Source" value={run.invocationSource} />
            <Row label="Exit code" value={run.exitCode !== null ? String(run.exitCode) : "—"} />
            {duration !== null && <Row label="Duration" value={`${duration}s`} />}
            {run.startedAt && <Row label="Started" value={new Date(run.startedAt).toLocaleString()} />}
            {run.finishedAt && <Row label="Finished" value={new Date(run.finishedAt).toLocaleString()} />}
          </CardContent>
        </Card>

        {run.errorMsg && (
          <Card className="border-destructive/50">
            <CardHeader><CardTitle className="text-sm text-destructive">Error</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap text-destructive">{run.errorMsg}</pre>
            </CardContent>
          </Card>
        )}
      </div>

      {run.resultJson && (
        <RunResult resultJson={run.resultJson} cardConfig={(run.agent?.adapterConfig as Record<string, unknown>)?.resultCard as ResultCardConfig | undefined} />
      )}

      {run.resultJson && <AutoResolveStatus run={run} />}

      {run.resultJson && (
        <OutcomePicker
          runId={run.id}
          initialOutcome={run.outcome}
          initialFields={run.outcomeFields}
          pastLabels={pastLabels}
          autoResolveActive={isAutoResolveActive(run)}
        />
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Logs</CardTitle></CardHeader>
        <CardContent>
          <LiveLogs
            runId={run.id}
            initialLogs={run.logs ?? ""}
            initialStatus={run.status}
            startedAt={run.startedAt}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function isAutoResolveActive(run: HeartbeatRun): boolean {
  const adapter = (run.agent?.adapterConfig ?? {}) as Record<string, unknown>;
  const card = adapter.resultCard as { type?: string; autoResolve?: { enabled?: boolean } } | undefined;
  if (!card || card.type !== "trade-decision") return false;
  return card.autoResolve?.enabled !== false;
}

function AutoResolveStatus({ run }: { run: HeartbeatRun }) {
  const fields = (run.outcomeFields ?? {}) as Record<string, unknown>;
  const source = typeof fields.source === "string" ? fields.source : null;
  const status = run.resolutionStatus;
  const meta = (run.resolutionMeta ?? {}) as Record<string, unknown>;

  if (!status && source !== "auto") return null;

  if (status === "active") {
    const enteredAt = typeof meta.enteredAt === "number" ? new Date(meta.enteredAt).toLocaleString() : null;
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 text-sm flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-medium">Active</span>
          <span className="text-muted-foreground">{enteredAt ? `entered ${enteredAt}` : "watching market"} · awaiting TP/SL</span>
        </CardContent>
      </Card>
    );
  }

  if (status === "pending") {
    return (
      <Card className="border-slate-500/30 bg-slate-500/5">
        <CardContent className="p-3 text-sm flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
          <span className="font-medium">Pending</span>
          <span className="text-muted-foreground">waiting for entry price</span>
        </CardContent>
      </Card>
    );
  }

  if (source === "auto" && (status === "resolved" || status === "expired")) {
    const r = typeof fields.r_multiple === "number" ? fields.r_multiple : null;
    const exit = typeof fields.exit_price === "number" ? fields.exit_price : null;
    const reason = typeof meta.reason === "string" ? meta.reason : null;
    const reasonText = reason === "tp_hit" ? "TP hit" : reason === "sl_hit" ? "SL hit" : reason === "same_bar_collision" ? "same-bar collision (conservative loss)" : reason === "no_fill_expired" ? "expired without fill" : reason === "no_resolution_expired" ? "expired before resolution" : reason;
    const tone = run.outcome === "Win" ? "border-emerald-500/30 bg-emerald-500/5" : run.outcome === "Loss" ? "border-red-500/30 bg-red-500/5" : "border-slate-500/30 bg-slate-500/5";
    const dot = run.outcome === "Win" ? "bg-emerald-400" : run.outcome === "Loss" ? "bg-red-400" : "bg-slate-400";
    return (
      <Card className={tone}>
        <CardContent className="p-3 text-sm flex items-center gap-3 flex-wrap">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span className="font-medium">Auto · {run.outcome}</span>
          {r !== null && <span className="text-muted-foreground">{r >= 0 ? "+" : ""}{r}R</span>}
          {exit !== null && <span className="text-muted-foreground">exit @ {exit}</span>}
          {reasonText && <span className="text-muted-foreground">· {reasonText}</span>}
        </CardContent>
      </Card>
    );
  }

  return null;
}
