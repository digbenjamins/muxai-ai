import Link from "next/link";
import { PlusCircle, Bot, AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { Agent, HeartbeatRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AgentStatusBadge } from "@/components/agent-status-badge";
import { RecentRunsList } from "@/components/recent-runs-list";

async function getAgents(): Promise<Agent[]> {
  try { return await apiFetch<Agent[]>("/api/agents"); } catch { return []; }
}
async function getRecentRunsForStats(): Promise<HeartbeatRun[]> {
  // Server-side fetch only for the status-bar today counters; the live runs list
  // is rendered by the RecentRunsList client component below with its own poller.
  try { return await apiFetch<HeartbeatRun[]>("/api/runs?limit=60"); } catch { return []; }
}
async function getLatestResult(): Promise<HeartbeatRun | null> {
  try {
    const runs = await apiFetch<HeartbeatRun[]>("/api/runs?withResults=true&limit=1");
    return runs[0] ?? null;
  } catch { return null; }
}

function shortModel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-")[1] ?? model;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Status Bar ────────────────────────────────────────────────────────────────

function StatCell({
  label, value, sub, tone,
}: {
  label: string; value: number; sub?: string; tone?: "warn";
}) {
  return (
    <div className="flex-1 flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] leading-tight">{label}</p>
        {sub && (
          <p className={`text-xs mt-0.5 truncate leading-tight ${tone === "warn" ? "text-amber-500" : "text-muted-foreground/80"}`}>
            {sub}
          </p>
        )}
      </div>
      <span className="text-2xl font-semibold tabular-nums tracking-tight shrink-0">{value}</span>
    </div>
  );
}

function StatusBar({
  active, running, scheduled, runsToday, failedToday, totalAgents, erroredCount, runningNames,
}: {
  active: number; running: number; scheduled: number; runsToday: number;
  failedToday: number; totalAgents: number; erroredCount: number; runningNames: string;
}) {
  const hasError = erroredCount > 0;
  const hasActivity = running > 0;
  const dotColor = hasError ? "bg-red-500" : hasActivity ? "bg-emerald-500" : "bg-muted-foreground/40";
  const headline = hasError
    ? `${erroredCount} agent${erroredCount > 1 ? "s" : ""} in error`
    : hasActivity
    ? `${running} running`
    : "All idle";
  const subline = hasError
    ? "needs attention"
    : hasActivity
    ? runningNames
    : "nothing running";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {hasActivity && !hasError && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
          <div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
            style={{ animation: "scan 3.2s linear infinite" }}
          />
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-stretch md:divide-x divide-border">
        {/* Live state */}
        <div className="flex items-center gap-3 px-5 py-3 md:min-w-[260px] border-b md:border-b-0 border-border">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {hasActivity && !hasError && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`}
              style={hasError ? { animation: "breathe 1.6s ease-in-out infinite" } : undefined}
            />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{headline}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate leading-tight">{subline}</p>
          </div>
        </div>

        <StatCell
          label="Active"
          value={active}
          sub={`${totalAgents} total`}
        />
        <StatCell
          label="Scheduled"
          value={scheduled}
          sub={scheduled > 0 ? "on schedule" : "none"}
        />
        <StatCell
          label="Runs today"
          value={runsToday}
          sub={failedToday > 0 ? `${failedToday} failed` : runsToday > 0 ? "all clean" : "—"}
          tone={failedToday > 0 ? "warn" : undefined}
        />
      </div>
    </div>
  );
}

// ─── Agent Row ─────────────────────────────────────────────────────────────────

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

function AgentRow({ agent }: { agent: Agent }) {
  const config = agent.adapterConfig as Record<string, unknown>;
  const rt = agent.runtimeConfig as Record<string, unknown>;
  const hb = rt?.heartbeat as { enabled?: boolean; cron?: string } | undefined;
  const model = shortModel((config.model as string) ?? "");

  return (
    <Link href={`/agents/${agent.id}`} className="block group">
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold uppercase ${roleColor(agent.role)}`}>
            {agent.name.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate">{agent.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate capitalize">{agent.title || agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {model && (
            <span className="hidden sm:inline-flex text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">{model}</span>
          )}
          {hb?.enabled && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs text-violet-400">
              <CalendarClock className="h-3 w-3" />
            </span>
          )}
          <span className="text-xs text-muted-foreground">{agent._count?.runs ?? 0}</span>
          <AgentStatusBadge status={agent.status} />
        </div>
      </div>
    </Link>
  );
}

// ─── Agent List ─────────────────────────────────────────────────────────────────

function AgentList({ agents }: { agents: Agent[] }) {
  const active = agents.filter((a) => a.status !== "terminated");
  const terminated = agents.filter((a) => a.status === "terminated");
  const sorted = [...active, ...terminated];

  return (
    <div className="space-y-1.5">
      {sorted.map((agent) => <AgentRow key={agent.id} agent={agent} />)}
    </div>
  );
}

// ─── Latest Result Strip ───────────────────────────────────────────────────────

function LatestResultStrip({ run }: { run: HeartbeatRun }) {
  const result = (run.resultJson ?? {}) as Record<string, unknown>;
  const adapter = (run.agent?.adapterConfig ?? {}) as Record<string, unknown>;
  const card = adapter.resultCard as { type?: string; mapping?: Record<string, string> } | undefined;
  const mapping = card?.mapping ?? {};
  const get = (key: string) => result[(mapping[key] || key)];

  const isTrade = card?.type === "trade-decision";
  const decision = String(get("decision") ?? "").toUpperCase();
  const asset = String(get("asset") ?? "");
  const timeframe = String(get("timeframe") ?? "");
  const fields = (run.outcomeFields ?? {}) as Record<string, unknown>;
  const rMultiple = typeof fields.r_multiple === "number" ? fields.r_multiple : null;
  const sideColor =
    decision === "LONG" ? "text-emerald-400" :
    decision === "SHORT" ? "text-red-400" :
    decision === "WAIT" ? "text-amber-400" : "text-muted-foreground";

  return (
    <Link
      href={`/agents/${run.agent?.id}/runs/${run.id}`}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors group"
    >
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground shrink-0">Latest</span>
      {isTrade ? (
        <>
          {asset && <span className="text-sm font-mono font-medium truncate">{asset}</span>}
          {timeframe && <span className="text-[10px] font-mono text-muted-foreground">{timeframe}</span>}
          {decision && <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${sideColor}`}>{decision}</span>}
          {run.outcome && (
            <span className={`text-[10px] font-mono uppercase tracking-wider ${
              run.outcome === "Win" ? "text-emerald-400" : run.outcome === "Loss" ? "text-red-400" : "text-muted-foreground"
            }`}>
              {run.outcome}{rMultiple !== null ? ` ${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R` : ""}
            </span>
          )}
        </>
      ) : (
        <span className="text-sm truncate text-muted-foreground">{run.agent?.name ?? "—"} — result available</span>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span className="hidden sm:inline truncate max-w-[120px]">{run.agent?.name ?? ""}</span>
        <span className="font-mono opacity-60">{timeAgo(run.createdAt)}</span>
        <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [agents, recentRuns, latestResult] = await Promise.all([getAgents(), getRecentRunsForStats(), getLatestResult()]);

  const active = agents.filter((a) => a.status !== "terminated");
  const running = agents.filter((a) => a.status === "running");
  const errored = agents.filter((a) => a.status === "error");
  const scheduled = agents.filter((a) => {
    const rt = a.runtimeConfig as Record<string, unknown>;
    return (rt?.heartbeat as { enabled?: boolean })?.enabled && a.status !== "terminated";
  });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const runsToday = recentRuns.filter((r) => new Date(r.createdAt) >= todayStart);
  const failedToday = runsToday.filter((r) => r.status === "failed").length;

  const systemStatus = errored.length > 0
    ? { label: "Degraded", color: "bg-red-500/10 text-red-400 border-red-500/20" }
    : running.length > 0
    ? { label: "Active", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" }
    : { label: "All idle", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">{formatDate()}</p>
          <h1 className="text-2xl font-bold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agents registered across {agents.filter(a => (a.reports ?? []).length > 0).length} teams</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${systemStatus.color}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {systemStatus.label}
          </div>
          <Button asChild size="sm">
            <Link href="/agents/new">
              <PlusCircle className="h-4 w-4" />
              New Agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        active={active.length}
        running={running.length}
        scheduled={scheduled.length}
        runsToday={runsToday.length}
        failedToday={failedToday}
        totalAgents={agents.length}
        erroredCount={errored.length}
        runningNames={running.length > 0 ? running.map((a) => a.name).join(", ") : ""}
      />

      {/* Latest result — single-line strip */}
      {latestResult?.resultJson && <LatestResultStrip run={latestResult} />}

      {/* Main content */}
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Agents</h2>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{active.length}</span>
            </div>
            {errored.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
                <AlertTriangle className="h-3 w-3" />
                {errored.length} error{errored.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
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
          ) : (
            <AgentList agents={agents} />
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-sm">Recent Runs</h2>
          <RecentRunsList />
        </div>
      </div>
    </div>
  );
}
