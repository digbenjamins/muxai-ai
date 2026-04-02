"use client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultCard } from "@/components/result-card";
import type { ResultCardConfig } from "@/lib/result-cards";

// ─── Muxai trade schema — auto-detected when no cardConfig is set ────────────

interface MuxaiTrade {
  [key: string]: unknown;
  decision: "LONG" | "SHORT" | "WAIT";
  asset: string;
  timeframe?: string;
  entry?: number;
  take_profit?: number;
  stop_loss?: number;
  risk_reward?: string;
  confidence?: "high" | "medium" | "low";
  technical_summary?: string;
  news_summary?: string;
  consensus?: string;
  conflict?: string;
  invalidation?: string;
  watch_for?: string[];
}

function isMuxaiTrade(json: Record<string, unknown>): json is MuxaiTrade {
  return (
    typeof json.decision === "string" &&
    ["LONG", "SHORT", "WAIT"].includes(json.decision as string) &&
    typeof json.asset === "string"
  );
}

// ─── Trade card ──────────────────────────────────────────────────────────────

const DECISION_STYLE = {
  LONG:  { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: TrendingUp },
  SHORT: { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",         icon: TrendingDown },
  WAIT:  { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: Minus },
};

const CONFIDENCE_COLOR = {
  high:   "text-emerald-400",
  medium: "text-amber-400",
  low:    "text-slate-400",
};

function TradeCard({ trade }: { trade: MuxaiTrade }) {
  const style = DECISION_STYLE[trade.decision];
  const Icon = style.icon;

  return (
    <div className={`rounded-xl border p-4 space-y-4 ${style.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${style.color}`} />
          <span className={`text-lg font-bold ${style.color}`}>{trade.decision}</span>
          <span className="text-sm font-semibold text-foreground">{trade.asset}</span>
          {trade.timeframe && (
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{trade.timeframe}</span>
          )}
        </div>
        {trade.confidence && (
          <span className={`text-xs font-medium capitalize ${CONFIDENCE_COLOR[trade.confidence] ?? "text-muted-foreground"}`}>
            {trade.confidence} confidence
          </span>
        )}
      </div>

      {trade.decision !== "WAIT" && (trade.entry || trade.take_profit || trade.stop_loss) && (
        <div className="grid grid-cols-3 gap-3">
          {trade.entry !== undefined && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Entry</p>
              <p className="text-sm font-mono font-medium">{trade.entry.toLocaleString("en-US")}</p>
            </div>
          )}
          {trade.take_profit !== undefined && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Take Profit</p>
              <p className="text-sm font-mono font-medium text-emerald-400">{trade.take_profit.toLocaleString("en-US")}</p>
            </div>
          )}
          {trade.stop_loss !== undefined && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Stop Loss</p>
              <p className="text-sm font-mono font-medium text-red-400">{trade.stop_loss.toLocaleString("en-US")}</p>
            </div>
          )}
          {trade.risk_reward && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">R:R</p>
              <p className="text-sm font-mono font-medium">{trade.risk_reward}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 text-sm">
        {trade.technical_summary && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Technical · </span>
            <span className="text-muted-foreground">{trade.technical_summary}</span>
          </div>
        )}
        {trade.news_summary && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">News · </span>
            <span className="text-muted-foreground">{trade.news_summary}</span>
          </div>
        )}
        {(trade.consensus || trade.conflict) && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {trade.consensus ? "Consensus" : "Conflict"} ·{" "}
            </span>
            <span className="text-muted-foreground">{trade.consensus ?? trade.conflict}</span>
          </div>
        )}
        {trade.invalidation && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Invalidation · </span>
            <span className="text-muted-foreground">{trade.invalidation}</span>
          </div>
        )}
        {trade.watch_for && trade.watch_for.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Watch for</span>
            <ul className="space-y-0.5">
              {trade.watch_for.map((w, i) => (
                <li key={i} className="text-muted-foreground flex gap-1.5">
                  <span className="text-amber-400 shrink-0">·</span>{w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Generic JSON viewer ─────────────────────────────────────────────────────

function JsonViewer({ json }: { json: Record<string, unknown> }) {
  return (
    <pre className="text-xs font-mono text-foreground/80 bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(json, null, 2)}
    </pre>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

export function RunResult({
  resultJson,
  cardConfig,
  compact,
}: {
  resultJson: Record<string, unknown>;
  cardConfig?: ResultCardConfig;
  compact?: boolean;
}) {
  const inner = cardConfig && cardConfig.type !== "raw" ? (
    <ResultCard config={cardConfig} data={resultJson} />
  ) : isMuxaiTrade(resultJson) && !cardConfig ? (
    <TradeCard trade={resultJson} />
  ) : (
    <JsonViewer json={resultJson} />
  );

  if (compact) return inner;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Result</CardTitle></CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
