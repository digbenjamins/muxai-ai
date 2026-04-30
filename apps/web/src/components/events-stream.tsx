"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, AlertCircle, Bomb, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";

interface EventRow {
  id: string;
  source: string;
  sourceId: string;
  kind: string;        // "macro" | "options-expiry" | "hack" | ...
  asset: string | null;
  title: string;
  description: string | null;
  importance: "high" | "medium" | "low";
  startsAt: string;    // ISO
  endsAt: string | null;
  metadata: Record<string, unknown> | null;
  fetchedAt: string;
}

interface UpcomingResponse { window_hours: number; count: number; events: EventRow[] }

type Density = "compact" | "full";
type ImportanceFilter = "high" | "medium";

export function EventsStream({
  density = "compact",
  asset,
  upcomingHours = 48,
  pollMs = 60_000,
}: {
  density?: Density;
  asset?: string;
  upcomingHours?: number;
  pollMs?: number;
}) {
  const [allUpcoming, setAllUpcoming] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // forces "in 3h" relative-time refresh
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>("high");

  const pageSize = density === "compact" ? 5 : 10;
  const [upcomingPage, setUpcomingPage] = useState(0);

  // Always fetch high+medium so the toggle is instant client-side; default view is high only.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        params.set("window_hours", String(upcomingHours));
        params.set("importance", "medium"); // route maps "medium" → high+medium
        if (asset) params.set("asset", asset);

        const up = await apiFetch<UpcomingResponse>(`/api/events/upcoming?${params}`);
        if (cancelled) return;
        setAllUpcoming(up.events);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load events");
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
  }, [asset, upcomingHours, pollMs]);

  const visible = useMemo(() => {
    return importanceFilter === "high"
      ? allUpcoming.filter((e) => e.importance === "high")
      : allUpcoming;
  }, [allUpcoming, importanceFilter]);

  const { critical, later } = useMemo(() => {
    const now = Date.now();
    const sixH = now + 6 * 3600 * 1000;
    const crit: EventRow[] = [];
    const lat: EventRow[] = [];
    for (const e of visible) {
      const ts = new Date(e.startsAt).getTime();
      if (ts <= sixH) crit.push(e);
      else lat.push(e);
    }
    return { critical: crit, later: lat };
  }, [visible, tick]);

  // Reset to page 0 when the filtered list changes shape
  useEffect(() => { setUpcomingPage(0); }, [later.length, importanceFilter]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
        Loading events…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
        Events unavailable: {error}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold">Events</h3>
          {asset && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
              · {asset}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 shrink-0">
          {(["high", "medium"] as ImportanceFilter[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setImportanceFilter(opt)}
              className={`px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
                importanceFilter === opt ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "high" ? "HIGH" : "+MED"}
            </button>
          ))}
        </div>
      </div>

      {critical.length === 0 && later.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <CalendarClock className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-xs font-medium">No {importanceFilter === "high" ? "high-impact " : ""}events</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {importanceFilter === "high" ? "Toggle +MED to widen the filter" : "Calendar is clear in this window"}
          </p>
        </div>
      ) : (
        <>
          {critical.length > 0 && (
            <Section
              label="Critical"
              tone="amber"
              subtitle="next 6h — high attention"
              tick={tick}
              items={critical}
              page={0}
              pageSize={critical.length}
              onPageChange={() => {}}
            />
          )}
          {later.length > 0 && (
            <Section
              label="Upcoming"
              tone="default"
              subtitle={`${later.length} in 6-${upcomingHours}h window`}
              tick={tick}
              items={later}
              page={upcomingPage}
              pageSize={pageSize}
              onPageChange={setUpcomingPage}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  label, tone, subtitle, items, tick, page, pageSize, onPageChange,
}: {
  label: string;
  tone: "amber" | "default";
  subtitle: string;
  items: EventRow[];
  tick: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const visible = items.slice(start, start + pageSize);
  const labelTone = tone === "amber" ? "text-amber-400" : "text-foreground";

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between gap-2 px-4 py-1.5 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.15em] ${labelTone}`}>{label}</span>
          <span className="text-[10px] text-muted-foreground/70 truncate">{subtitle}</span>
        </div>
        {totalPages > 1 && (
          <Pager page={safePage} total={totalPages} onChange={onPageChange} />
        )}
      </div>
      <ul className="divide-y divide-border/60">
        {visible.map((e) => (
          <EventItem key={e.id} ev={e} tick={tick} />
        ))}
      </ul>
    </div>
  );
}

function EventItem({ ev, tick }: { ev: EventRow; tick: number }) {
  const ts = new Date(ev.startsAt).getTime();
  const rel = timeUntil(ts, tick);
  const Icon = ev.kind === "hack" ? Bomb : ev.kind === "options-expiry" ? CalendarClock : AlertCircle;

  return (
    <li className="px-4 py-2 hover:bg-foreground/[0.02] transition-colors">
      <div className="flex items-start gap-2.5">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/70" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0 ${timeColorClass(ts, tick)}`}>{rel}</span>
            <ImportanceBadge importance={ev.importance} />
            <AssetTag ev={ev} />
            <KindTag kind={ev.kind} />
          </div>
          <p className="text-xs font-medium mt-1 leading-snug truncate">{ev.title}</p>
          {ev.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">{ev.description}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function ImportanceBadge({ importance }: { importance: EventRow["importance"] }) {
  const styles =
    importance === "high"
      ? "bg-red-500/15 text-red-400 border-red-500/20"
      : importance === "medium"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
      : "bg-slate-500/15 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex text-[9px] font-mono font-semibold uppercase tracking-wider px-1 py-0 rounded border ${styles}`}>
      {importance === "high" ? "HIGH" : importance === "medium" ? "MED" : "LOW"}
    </span>
  );
}

function AssetTag({ ev }: { ev: EventRow }) {
  const country = (ev.metadata?.country as string | undefined) ?? null;
  const tag = ev.asset ?? country ?? null;
  if (!tag) return null;
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80">[{tag}]</span>
  );
}

function KindTag({ kind }: { kind: string }) {
  if (kind === "macro") return null; // already implied by [USD]/[EUR] tag
  const label = kind === "options-expiry" ? "OPT" : kind === "hack" ? "HACK" : kind.toUpperCase();
  return (
    <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</span>
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

// ─── Time helpers ─────────────────────────────────────────────────────────────

function timeUntil(ts: number, _tick: number): string {
  void _tick; // re-render hint only
  const diff = ts - Date.now();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

function timeColorClass(ts: number, _tick: number): string {
  void _tick;
  const diff = ts - Date.now();
  if (diff <= 0) return "text-red-400";
  if (diff <= 6 * 3600 * 1000) return "text-amber-400";
  return "text-foreground/80";
}
