"use client";
import { useState } from "react";
import { Bell, BellRing, Check, Plus, X } from "lucide-react";
import { API_URL, API_KEY } from "@/lib/utils";
import type { PriceWatch } from "@/components/watch-for-list";

export interface SelectedTradeContext {
  runId: string;
  symbol: string;
  interval: string | null;
  asset: string;
}

interface Props {
  watches: PriceWatch[];           // active + triggered (the panel groups them)
  onChange: () => void;
  onSelect?: (runId: string) => void;
  selectedTrade: SelectedTradeContext | null;
}

export function ActiveWatchesPanel({ watches, onChange, onSelect, selectedTrade }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const active = watches.filter((w) => w.status === "active");
  const triggered = watches.filter((w) => w.status === "triggered");

  if (active.length === 0 && triggered.length === 0 && !selectedTrade) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/15">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
            Notifications
          </span>
          {triggered.length > 0 && (
            <span className="text-[10px] font-mono text-emerald-400">
              · {triggered.length} hit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{active.length}</span>
          {selectedTrade && (
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-300 hover:text-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition-colors"
              title={`Add custom notification on ${selectedTrade.asset}`}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>
      </div>

      {addOpen && selectedTrade && (
        <div className="border-b border-amber-500/15 px-3 py-2">
          <CustomNotificationForm
            trade={selectedTrade}
            onSaved={() => { setAddOpen(false); onChange(); }}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      {active.length === 0 && triggered.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">
          No notifications yet — use “+ Add” to set one on {selectedTrade!.asset}.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {active.length > 0 && (
            <Section title="Armed" tone="amber" count={active.length}>
              <GroupedList watches={active} onChange={onChange} onSelect={onSelect} variant="active" />
            </Section>
          )}
          {triggered.length > 0 && (
            <Section title="Hit" tone="emerald" count={triggered.length}>
              <GroupedList watches={triggered} onChange={onChange} onSelect={onSelect} variant="triggered" />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title, tone, count, children,
}: {
  title: string;
  tone: "amber" | "emerald";
  count: number;
  children: React.ReactNode;
}) {
  const color = tone === "amber" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="border-b border-amber-500/10 last:border-b-0">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${color}`}>{title}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

function GroupedList({
  watches, onChange, onSelect, variant,
}: {
  watches: PriceWatch[];
  onChange: () => void;
  onSelect?: (runId: string) => void;
  variant: "active" | "triggered";
}) {
  const bySymbol = new Map<string, PriceWatch[]>();
  for (const w of watches) {
    const list = bySymbol.get(w.symbol) ?? [];
    list.push(w);
    bySymbol.set(w.symbol, list);
  }
  return (
    <ul className="divide-y divide-amber-500/10">
      {Array.from(bySymbol.entries()).map(([symbol, list]) => (
        <li key={symbol} className="px-3 py-2 space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {symbol}
          </div>
          {list.map((w) => (
            <WatchRow key={w.id} watch={w} onChange={onChange} onSelect={onSelect} variant={variant} />
          ))}
        </li>
      ))}
    </ul>
  );
}

function WatchRow({
  watch, onChange, onSelect, variant,
}: {
  watch: PriceWatch;
  onChange: () => void;
  onSelect?: (runId: string) => void;
  variant: "active" | "triggered";
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`${API_URL}/api/watches/${watch.id}`, {
        method: "DELETE",
        headers: API_KEY ? { "X-Api-Key": API_KEY } : {},
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const kindTone =
    watch.kind === "confirms" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : watch.kind === "invalidates" ? "bg-red-500/10 text-red-300 border-red-500/30"
    : variant === "triggered" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : "bg-amber-500/10 text-amber-300 border-amber-500/30";

  const kindLabel =
    watch.kind === "confirms" ? "confirms"
    : watch.kind === "invalidates" ? "invalidates"
    : null;

  const dismissTitle = variant === "triggered" ? "Dismiss" : "Delete";

  return (
    <div className="flex items-center gap-2 text-xs group">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border shrink-0 ${kindTone}`}>
        {variant === "triggered" ? <Check className="h-2.5 w-2.5" /> : <BellRing className="h-2.5 w-2.5" />}
        {watch.direction === "above" ? "≥" : "≤"} {watch.price}
      </span>
      {kindLabel && (
        <span className={`text-[9px] font-mono uppercase tracking-wider shrink-0 ${
          watch.kind === "confirms" ? "text-emerald-400/80" : "text-red-400/80"
        }`}>
          {kindLabel}
        </span>
      )}
      <button
        onClick={() => onSelect?.(watch.runId)}
        className="flex-1 text-left truncate text-muted-foreground hover:text-foreground transition-colors disabled:cursor-default"
        disabled={!onSelect}
        title={watch.label}
      >
        {watch.label}
      </button>
      {variant === "triggered" && watch.triggeredAt && (
        <span className="text-[9px] font-mono text-emerald-400/70 shrink-0" title={new Date(watch.triggeredAt).toLocaleString()}>
          {relativeTime(watch.triggeredAt)}
        </span>
      )}
      <button
        onClick={remove}
        disabled={busy}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
        aria-label={dismissTitle}
        title={dismissTitle}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function CustomNotificationForm({
  trade, onSaved, onCancel,
}: {
  trade: SelectedTradeContext;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<"confirms" | "invalidates">("confirms");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const n = parseFloat(price);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive price"); return; }
    const label = message.trim().length > 0 ? message.trim() : `Custom alert at ${n}`;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/runs/${trade.runId}/watches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { "X-Api-Key": API_KEY } : {}) },
        body: JSON.stringify({
          symbol: trade.symbol,
          interval: trade.interval,
          price: n,
          kind,
          label,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Failed (${res.status})`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        New notification — {trade.asset}
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border p-0.5 w-fit">
        {(["confirms", "invalidates"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
              kind === k
                ? k === "confirms"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Price</label>
          <input
            type="number"
            step="any"
            min={0}
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full h-7 px-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            placeholder="e.g. 95000"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Message</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-7 px-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            placeholder="What does this level mean?"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="h-7 px-3 text-xs font-medium rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const dt = Date.now() - new Date(iso).getTime();
  if (dt < 60_000) return "just now";
  const m = Math.floor(dt / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
