"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AgentStatus } from "@/lib/types";

export function PauseButton({ agentId, status, hasSchedule }: { agentId: string; status: AgentStatus; hasSchedule: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isPaused = status === "paused";
  if (status === "terminated" || !hasSchedule) return null;

  async function toggle() {
    setLoading(true);
    try {
      await apiFetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: isPaused ? "idle" : "paused" }),
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={toggle} disabled={loading || status === "running"} variant="outline" size="sm">
      {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {loading ? "..." : isPaused ? "Resume Schedule" : "Pause Schedule"}
    </Button>
  );
}
