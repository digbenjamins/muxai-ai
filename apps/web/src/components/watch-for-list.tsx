"use client";
import { useState } from "react";
import { Bell, X, Check } from "lucide-react";
import { API_URL, API_KEY } from "@/lib/utils";

export interface PriceWatch {
  id: string;
  runId: string;
  symbol: string;
  interval: string | null;
  price: number;
  direction: "above" | "below";
  // Thesis-relative meaning of the alert. null on legacy rows created before
  // we introduced this field — those still trigger correctly, just without
  // the colored confirms/invalidates badge.
  kind: "confirms" | "invalidates" | null;
  label: string;
  status: "active" | "triggered" | "cancelled";
  triggeredAt: string | null;
  triggeredPrice: number | null;
  createdAt: string;
}

interface Props {
  items: unknown[];        // raw watch_for items (strings or { item, status, evidence } objects)
  watches: PriceWatch[];
  runId: string;
  symbol: string;
  interval?: string | null;
  accent: string;          // theme color class from ResultCard
  onChange: () => void;    // called after a watch is created or removed so the chart refreshes
}

// Pull the renderable text out of a watch_for item — strings pass through,
// objects use item/label/title, anything weirder falls back to JSON.
function itemLabel(item: unknown): string | null {
  if (item == null) return null;
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    if (typeof obj.item === "string") return obj.item;
    if (typeof obj.label === "string") return obj.label;
    if (typeof obj.title === "string") return obj.title;
  }
  return null;
}

export function WatchForList({ items, watches, runId, symbol, interval, accent, onChange }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.map((item, i) => {
          const label = itemLabel(item);
          const linked = label ? watches.filter((w) => w.label === label) : [];
          return (
            <li key={i} className="text-sm">
              <ItemRow item={item} accent={accent} linked={linked}>
                {label && (
                  <button
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Set a price alert for this item"
                    aria-label="Add price alert"
                  >
                    <Bell className="h-3 w-3" />
                  </button>
                )}
              </ItemRow>
              {openIdx === i && label && (
                <WatchEditor
                  runId={runId}
                  symbol={symbol}
                  interval={interval ?? null}
                  label={label}
                  onSaved={() => { setOpenIdx(null); onChange(); }}
                  onCancel={() => setOpenIdx(null)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {watches.length > 0 && (
        <ExistingWatches watches={watches} onRemoved={onChange} />
      )}
    </div>
  );
}

function ItemRow({
  item, accent, linked, children,
}: { item: unknown; accent: string; linked: PriceWatch[]; children?: React.ReactNode }) {
  // Mirror result-card's ListItem rendering but with room for the bell.
  if (item == null) return null;
  const label = itemLabel(item);

  if (typeof item === "object" && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    const status = typeof obj.status === "string" ? obj.status : null;
    const evidence = typeof obj.evidence === "string" ? obj.evidence
      : typeof obj.note === "string" ? obj.note
      : null;
    const statusTone = status === "played_out" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30"
      : status === "pending" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-muted/30 text-muted-foreground border-border";
    return (
      <div className="flex gap-2 items-start">
        <span className={`${accent} shrink-0 mt-0.5`}>·</span>
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {status && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${statusTone}`}>
                {status.replace(/_/g, " ")}
              </span>
            )}
            {label && <span className="text-muted-foreground">{label}</span>}
            {linked.length > 0 && <LinkedBadges watches={linked} />}
          </div>
          {evidence && <div className="text-xs text-muted-foreground/80 italic">{evidence}</div>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 items-start">
      <span className={`${accent} shrink-0`}>·</span>
      <span className="flex-1 text-muted-foreground">
        {label ?? JSON.stringify(item)}
        {linked.length > 0 && <span className="ml-2 inline-flex"><LinkedBadges watches={linked} /></span>}
      </span>
      {children}
    </div>
  );
}

function LinkedBadges({ watches }: { watches: PriceWatch[] }) {
  return (
    <>
      {watches.map((w) => {
        // Triggered always reads emerald (the level actually fired). For armed
        // alerts we color by kind so a quick glance separates thesis-supporting
        // levels (emerald) from thesis-breakers (red); legacy rows fall back
        // to the neutral amber.
        const tone =
          w.status === "triggered"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            : w.kind === "confirms"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : w.kind === "invalidates"
                ? "bg-red-500/10 text-red-400 border-red-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30";
        return (
          <span
            key={w.id}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${tone}`}
          >
            {w.status === "triggered" ? <Check className="h-2.5 w-2.5" /> : <Bell className="h-2.5 w-2.5" />}
            {w.direction === "above" ? "≥" : "≤"} {w.price}
          </span>
        );
      })}
    </>
  );
}

function WatchEditor({
  runId, symbol, interval, label, onSaved, onCancel,
}: {
  runId: string;
  symbol: string;
  interval: string | null;
  label: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  // The user picks the thesis-relative meaning (confirms / invalidates); the
  // server infers the above/below trigger contract from the price vs. last
  // close. Optional message overrides the watch_for item as the label.
  const [kind, setKind] = useState<"confirms" | "invalidates">("confirms");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const n = parseFloat(price);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive price"); return; }
    const finalLabel = message.trim().length > 0 ? message.trim() : label;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/runs/${runId}/watches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { "X-Api-Key": API_KEY } : {}) },
        body: JSON.stringify({ symbol, interval, price: n, kind, label: finalLabel }),
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
    <div className="mt-1 ml-5 space-y-2 rounded border border-amber-500/30 bg-amber-500/[0.04] p-2">
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
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Price ({symbol})</label>
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
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Message (optional)</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-7 px-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            placeholder={label}
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

function ExistingWatches({ watches, onRemoved }: { watches: PriceWatch[]; onRemoved: () => void }) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-1">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Watches</p>
      <ul className="space-y-1">
        {watches.map((w) => (
          <WatchListRow key={w.id} watch={w} onRemoved={onRemoved} />
        ))}
      </ul>
    </div>
  );
}

function WatchListRow({ watch, onRemoved }: { watch: PriceWatch; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);
  const triggered = watch.status === "triggered";

  async function remove() {
    setRemoving(true);
    try {
      await fetch(`${API_URL}/api/watches/${watch.id}`, {
        method: "DELETE",
        headers: API_KEY ? { "X-Api-Key": API_KEY } : {},
      });
      onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  const tone = triggered
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : watch.kind === "confirms"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : watch.kind === "invalidates"
        ? "bg-red-500/10 text-red-400 border-red-500/30"
        : "bg-amber-500/10 text-amber-400 border-amber-500/30";

  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${tone}`}>
        {triggered ? <Check className="h-2.5 w-2.5" /> : <Bell className="h-2.5 w-2.5" />}
        {watch.direction === "above" ? "≥" : "≤"} {watch.price}
      </span>
      {watch.kind && !triggered && (
        <span className={`text-[9px] font-mono uppercase tracking-wider ${
          watch.kind === "confirms" ? "text-emerald-400/80" : "text-red-400/80"
        }`}>
          {watch.kind}
        </span>
      )}
      <span className="flex-1 truncate text-muted-foreground">{watch.label}</span>
      {triggered && watch.triggeredAt && (
        <span className="text-[10px] font-mono text-emerald-400/80">
          fired {new Date(watch.triggeredAt).toLocaleString()}
        </span>
      )}
      <button
        onClick={remove}
        disabled={removing}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        aria-label="Remove watch"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
