import Link from "next/link";
import { ChevronRight, LineChart } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import type { HeartbeatRun } from "@/lib/types";

async function getRunsWithResults(): Promise<HeartbeatRun[]> {
  try { return await apiFetch<HeartbeatRun[]>("/api/runs?withResults=true&limit=500"); } catch { return []; }
}

interface ResultSection {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  cardType: string;
}

const SECTIONS: ResultSection[] = [
  {
    id: "trade-decisions",
    href: "/results/trade-decisions",
    label: "Trade Decisions",
    description: "LONG / SHORT / WAIT calls from trading teams, with live monitoring and resolved P&L.",
    icon: LineChart,
    cardType: "trade-decision",
  },
];

function countByType(runs: HeartbeatRun[], cardType: string): number {
  return runs.filter((r) => {
    const adapter = (r.agent?.adapterConfig ?? {}) as Record<string, unknown>;
    const card = adapter.resultCard as { type?: string } | undefined;
    return card?.type === cardType;
  }).length;
}

export default async function ResultsPage() {
  const runs = await getRunsWithResults();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Results</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Outputs from your agents, organized by result type.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const count = countByType(runs, s.cardType);
          const Icon = s.icon;
          return (
            <Link
              key={s.id}
              href={s.href}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{count}</span>
              </div>
              <div>
                <p className="font-semibold text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                <span>View</span>
                <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
