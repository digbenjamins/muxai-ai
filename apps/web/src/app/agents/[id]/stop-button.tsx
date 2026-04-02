"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function StopButton({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStop() {
    setLoading(true);
    try {
      await apiFetch(`/api/agents/${agentId}/stop`, { method: "POST" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleStop} disabled={loading} size="sm" variant="destructive">
      <Square className="h-4 w-4" />
      {loading ? "Stopping..." : "Stop"}
    </Button>
  );
}
