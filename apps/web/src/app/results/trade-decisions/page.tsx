import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { HeartbeatRun } from "@/lib/types";
import { ResultsTerminal } from "./terminal";

async function getRunsWithResults(): Promise<HeartbeatRun[]> {
  try { return await apiFetch<HeartbeatRun[]>("/api/runs?withResults=true&limit=200"); } catch { return []; }
}

export default async function TradeDecisionsPage() {
  const runs = await getRunsWithResults();
  const tradeRuns = runs.filter((r) => {
    const adapter = (r.agent?.adapterConfig ?? {}) as Record<string, unknown>;
    const card = adapter.resultCard as { type?: string } | undefined;
    return card?.type === "trade-decision";
  });

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/results"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Results
        </Link>
        <h1 className="text-xl font-semibold">Trade Decisions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live monitoring and resolved outcomes for trade-decision runs.</p>
      </div>
      <ResultsTerminal runs={tradeRuns} />
    </div>
  );
}
