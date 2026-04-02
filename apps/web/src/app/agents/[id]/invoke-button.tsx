"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function InvokeButton({ agentId, disabled = false }: { agentId: string; disabled?: boolean; size?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleInvoke() {
    setLoading(true);
    try {
      await apiFetch(`/api/agents/${agentId}/invoke`, { method: "POST" });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to invoke agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleInvoke} disabled={disabled || loading} size="sm">
      <Play className="h-4 w-4" />
      {loading ? "Invoking..." : "Run Now"}
    </Button>
  );
}
