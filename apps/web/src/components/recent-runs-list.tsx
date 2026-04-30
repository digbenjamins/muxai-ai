"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { HeartbeatRun } from "@/lib/types";
import { RunStatusBadge } from "@/components/run-status-badge";

const RUN_DOT: Record<string, string> = {
  succeeded: "bg-emerald-500",
  failed: "bg-red-500",
  running: "bg-blue-500 animate-pulse",
  queued: "bg-amber-500",
  cancelled: "bg-slate-500",
  timed_out: "bg-orange-500",
};

export function RecentRunsList({
  fetchLimit = 60,
  pageSize = 6,
  pollMs = 30_000,
}: {
  fetchLimit?: number;
  pageSize?: number;
  pollMs?: number;
}) {
  const [runs, setRuns] = useState<HeartbeatRun[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<HeartbeatRun[]>(`/api/runs?limit=${fetchLimit}`);
        if (!cancelled) {
          setRuns(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load runs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const fetchTimer = setInterval(load, pollMs);
    const tickTimer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      cancelled = true;
      clearInterval(fetchTimer);
      clearInterval(tickTimer);
    };
  }, [fetchLimit, pollMs]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
        Loading runs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
        Runs unavailable: {error}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Play className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No runs yet</p>
        <p className="text-xs text-muted-foreground mt-1">Runs appear here once agents are invoked</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(runs.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visible = runs.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/20">
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            {runs.length} run{runs.length === 1 ? "" : "s"}
          </span>
          <Pager page={safePage} total={totalPages} onChange={setPage} />
        </div>
      )}
      <div className="divide-y divide-border">
        {visible.map((run) => <RunRow key={run.id} run={run} tick={tick} />)}
      </div>
    </div>
  );
}

function RunRow({ run, tick }: { run: HeartbeatRun; tick: number }) {
  const dur = duration(run);
  return (
    <Link href={`/agents/${run.agent?.id}/runs/${run.id}`} className="flex items-start gap-3 group py-2.5 px-4 hover:bg-accent/40 transition-colors">
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className={`h-2 w-2 rounded-full shrink-0 ${RUN_DOT[run.status] ?? "bg-slate-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{run.agent?.name ?? "—"}</span>
          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(run.createdAt, tick)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <RunStatusBadge status={run.status} />
          {dur && <span className="text-xs text-muted-foreground font-mono">{dur}</span>}
          <span className="text-xs text-muted-foreground capitalize opacity-60">{run.invocationSource?.replace("_", " ")}</span>
        </div>
      </div>
    </Link>
  );
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
        {page + 1}/{total}
      </span>
      <button
        onClick={() => onChange(Math.min(total - 1, page + 1))}
        disabled={page >= total - 1}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Next page"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function timeAgo(dateStr: string, _tick: number): string {
  void _tick;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function duration(run: HeartbeatRun): string | null {
  if (!run.startedAt || !run.finishedAt) return null;
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
