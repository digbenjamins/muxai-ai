"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL, API_KEY } from "@/lib/utils";
import { outcomeTone } from "@/components/outcome-badge";

const DEFAULT_PRESETS = ["Win", "Loss", "Neutral", "NA"];

const TONE_CLASSES: Record<ReturnType<typeof outcomeTone>, string> = {
  positive: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
  negative: "bg-red-500/15 border-red-500/40 text-red-300",
  warning:  "bg-amber-500/15 border-amber-500/40 text-amber-300",
  neutral:  "bg-slate-500/15 border-slate-500/40 text-slate-300",
};

type Field = { key: string; value: string };

function fieldsObjectToList(obj: Record<string, unknown> | null): Field[] {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: value == null ? "" : String(value),
  }));
}

function fieldsListToObject(list: Field[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const { key, value } of list) {
    const k = key.trim();
    if (!k || !value.trim()) continue;
    const n = Number(value);
    out[k] = value.trim() !== "" && !isNaN(n) ? n : value.trim();
  }
  return out;
}

export function OutcomePicker({
  runId,
  initialOutcome,
  initialFields,
  pastLabels,
}: {
  runId: string;
  initialOutcome: string | null;
  initialFields: Record<string, unknown> | null;
  pastLabels?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<string | null>(initialOutcome);
  const [customLabel, setCustomLabel] = useState<string>("");
  const [showCustom, setShowCustom] = useState(false);
  const [fields, setFields] = useState<Field[]>(fieldsObjectToList(initialFields));
  const [error, setError] = useState<string | null>(null);

  const presetSet = new Set<string>([...DEFAULT_PRESETS, ...(pastLabels ?? [])].map((s) => s.toLowerCase()));
  const extraPresets = (pastLabels ?? []).filter((l) => !DEFAULT_PRESETS.some((d) => d.toLowerCase() === l.toLowerCase()));

  async function save(nextOutcome: string | null, nextFields: Field[] = fields) {
    setError(null);
    const body = nextOutcome
      ? { outcome: nextOutcome, fields: fieldsListToObject(nextFields) }
      : { outcome: null };
    const res = await fetch(`${API_URL}/api/runs/${runId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(API_KEY ? { "X-Api-Key": API_KEY } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      setError(msg || "Failed to save outcome");
      return;
    }
    setOutcome(nextOutcome);
    startTransition(() => router.refresh());
  }

  function pickPreset(label: string) {
    setShowCustom(false);
    setCustomLabel("");
    save(label);
  }

  function applyCustom() {
    const label = customLabel.trim();
    if (!label) return;
    save(label);
  }

  function addField() {
    setFields((f) => [...f, { key: "", value: "" }]);
  }

  function updateField(i: number, patch: Partial<Field>) {
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeField(i: number) {
    setFields((f) => {
      const next = f.filter((_, idx) => idx !== i);
      if (outcome) save(outcome, next);
      return next;
    });
  }

  function commitFields() {
    if (outcome) save(outcome, fields);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Outcome</CardTitle>
        <p className="text-xs text-muted-foreground">
          How did this decision play out? Pick a label (or write your own) and add any context the agent should remember.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {DEFAULT_PRESETS.map((label) => {
            const active = outcome?.toLowerCase() === label.toLowerCase();
            const tone = TONE_CLASSES[outcomeTone(label)];
            return (
              <button
                key={label}
                type="button"
                onClick={() => pickPreset(label)}
                disabled={pending}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active ? tone : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {label}
              </button>
            );
          })}
          {extraPresets.map((label) => {
            const active = outcome?.toLowerCase() === label.toLowerCase();
            const tone = TONE_CLASSES[outcomeTone(label)];
            return (
              <button
                key={label}
                type="button"
                onClick={() => pickPreset(label)}
                disabled={pending}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  active ? tone : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {label}
              </button>
            );
          })}
          {outcome && !presetSet.has(outcome.toLowerCase()) && (
            <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${TONE_CLASSES[outcomeTone(outcome)]}`}>
              {outcome}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            disabled={pending}
            className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {showCustom ? "Cancel" : "Custom…"}
          </button>
        </div>

        {showCustom && (
          <div className="flex gap-2">
            <Input
              placeholder="e.g. stopped_early"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCustom();
                }
              }}
              disabled={pending}
              maxLength={80}
              autoFocus
            />
            <Button onClick={applyCustom} disabled={pending || !customLabel.trim()} size="sm" className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        )}

        {/* Custom fields */}
        {outcome && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-xs text-muted-foreground">Fields (optional)</Label>
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground/60">Add any detail — pnl, reason, fees, notes… anything you want the agent to remember.</p>
            )}
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="w-40"
                  placeholder="key (e.g. pnl)"
                  value={f.key}
                  onChange={(e) => updateField(i, { key: e.target.value })}
                  onBlur={commitFields}
                  disabled={pending}
                />
                <Input
                  className="flex-1"
                  placeholder="value"
                  value={f.value}
                  onChange={(e) => updateField(i, { value: e.target.value })}
                  onBlur={commitFields}
                  disabled={pending}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(i)}
                  disabled={pending}
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                  aria-label="Remove field"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={addField}
              disabled={pending}
              className="text-muted-foreground gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add field
            </Button>
          </div>
        )}

        {outcome && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFields([]);
              save(null, []);
            }}
            disabled={pending}
            className="text-muted-foreground gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear outcome
          </Button>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </CardContent>
    </Card>
  );
}
