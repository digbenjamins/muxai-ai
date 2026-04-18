export function outcomeTone(label: string): "positive" | "negative" | "neutral" | "warning" {
  const l = label.toLowerCase();
  if (/\b(win|won|profit|tp|success|hit|good)\b/.test(l)) return "positive";
  if (/\b(loss|lost|lose|sl|fail|bad|stopped)\b/.test(l)) return "negative";
  if (/\b(invalid|voided|cancel|partial|early)\b/.test(l)) return "warning";
  return "neutral";
}

const TONES: Record<"positive" | "negative" | "neutral" | "warning", string> = {
  positive: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  negative: "bg-red-500/15 border-red-500/30 text-red-300",
  warning:  "bg-amber-500/15 border-amber-500/30 text-amber-300",
  neutral:  "bg-slate-500/15 border-slate-500/30 text-slate-300",
};

export function OutcomeBadge({
  outcome,
  fields,
}: {
  outcome: string;
  fields?: Record<string, unknown> | null;
}) {
  const tone = outcomeTone(outcome);
  const pnl = fields && "pnl" in fields ? fields.pnl : null;
  const pnlNum = typeof pnl === "number" ? pnl : typeof pnl === "string" && pnl.trim() !== "" && !isNaN(Number(pnl)) ? Number(pnl) : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      <span className="capitalize">{outcome}</span>
      {pnlNum !== null && (
        <span className="font-mono opacity-70">· {pnlNum > 0 ? "+" : ""}{pnlNum}</span>
      )}
    </span>
  );
}
