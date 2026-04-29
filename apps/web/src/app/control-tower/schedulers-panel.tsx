"use client";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface SchedulerEntry {
  id: string;
  kind: "heartbeat" | "trade-resolver" | "telegram";
  label: string;
  schedule: string;
  status: "idle" | "running" | "error";
  registeredAt: string;
  lastTickAt?: string;
  lastError?: string;
  meta?: Record<string, unknown>;
}

const POLL_MS = 5000;

export function SchedulersPanel() {
  const [entries, setEntries] = useState<SchedulerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await apiFetch<{ schedulers: SchedulerEntry[] }>("/api/schedulers");
        if (!alive) return;
        setEntries(res.schedulers);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    load();
    const handle = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(handle); };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Schedulers</h2>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-3 px-4 text-xs text-red-500">{error}</CardContent>
        </Card>
      )}

      {!error && entries && entries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-4 px-4 text-xs text-muted-foreground">
            No schedulers running. Scheduled agents and the trade resolver will appear here when active.
          </CardContent>
        </Card>
      )}

      {entries && entries.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                  <StatusDot status={e.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{e.label}</span>
                      <KindBadge kind={e.kind} />
                      <SchedulePill schedule={e.schedule} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">{relativeTime(e.lastTickAt)}</span>
                      {metaLine(e) && (
                        <span className="text-[11px] text-muted-foreground">· {metaLine(e)}</span>
                      )}
                      {e.lastError && (
                        <span className="text-[11px] text-red-500 truncate">· {e.lastError}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: SchedulerEntry["status"] }) {
  const cls =
    status === "running"
      ? "bg-amber-400 animate-pulse"
      : status === "error"
      ? "bg-red-500"
      : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function KindBadge({ kind }: { kind: SchedulerEntry["kind"] }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground border border-border rounded px-1.5 py-0.5">
      {kind}
    </span>
  );
}

function SchedulePill({ schedule }: { schedule: string }) {
  return (
    <span className="font-mono text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
      {schedule}
    </span>
  );
}

function relativeTime(iso?: string): string {
  if (!iso) return "no ticks yet";
  const t = new Date(iso).getTime();
  const dt = Date.now() - t;
  if (dt < 0) return "just now";
  if (dt < 1000) return "just now";
  const s = Math.floor(dt / 1000);
  if (s < 60) return `last tick · ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `last tick · ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `last tick · ${h}h ago`;
  return `last tick · ${Math.floor(h / 24)}d ago`;
}

function metaLine(e: SchedulerEntry): string | null {
  const m = e.meta ?? {};
  if (e.kind === "trade-resolver") {
    const open = typeof m.open === "number" ? m.open : null;
    const resolved = typeof m.resolvedThisTick === "number" ? m.resolvedThisTick : null;
    if (open === null && resolved === null) return null;
    return `${open ?? 0} open · ${resolved ?? 0} resolved last tick`;
  }
  if (e.kind === "telegram") {
    const msgs = typeof m.msgsHandled === "number" ? m.msgsHandled : 0;
    const owner = typeof m.ownerUsername === "string" ? m.ownerUsername : null;
    return owner ? `@${owner} · ${msgs} msg${msgs === 1 ? "" : "s"}` : `unpaired · ${msgs} msgs`;
  }
  if (e.kind === "heartbeat") {
    const skip = typeof m.lastSkipReason === "string" ? `last skip: ${m.lastSkipReason}` : null;
    return skip;
  }
  return null;
}
