"use client";
import { useCallback, useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemoryResetButton, type MemoryStatus } from "../memory-pill";

export function MemoryPanel({ agentId }: { agentId: string }) {
  const [status, setStatus] = useState<MemoryStatus | null>(null);

  const load = useCallback(() => {
    apiFetch<MemoryStatus>(`/api/agents/${agentId}/memory`)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  if (!status?.enabled) return null;

  const sessionAge = status.sessionUpdatedAt ? formatAge(status.sessionUpdatedAt) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          Active Memory
        </CardTitle>
        <MemoryResetButton agentId={agentId} status={status} onResetComplete={load} />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Status" value={status.hasSession ? "Carrying context" : "Fresh — no session yet"} />
        <Row label="Runs since reset" value={String(status.runsSinceReset)} />
        {sessionAge && <Row label="Session age" value={sessionAge} />}
        {!status.hasSession && (
          <p className="text-xs text-muted-foreground pt-1">
            Next run will start the shared session. Chat and scheduled runs will both resume from it.
          </p>
        )}
        {status.hasSession && status.runsSinceReset > 20 && (
          <p className="text-xs text-amber-500 pt-1">
            High context accumulation — consider resetting to keep runs fast.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatAge(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  const days = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0 ? `${days}d ${remHr}h` : `${days}d`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
