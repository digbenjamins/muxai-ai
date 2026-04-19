"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface MemoryStatus {
  enabled: boolean;
  hasSession: boolean;
  sessionUpdatedAt: string | null;
  runsSinceReset: number;
}

export function MemoryPill({ status }: { status: MemoryStatus }) {
  if (!status.enabled) return null;
  const drifting = status.runsSinceReset > 20;

  if (!status.hasSession) {
    return (
      <span className="flex items-center gap-1 text-xs text-violet-400/70">
        <Brain className="h-3 w-3" />
        Memory: fresh
      </span>
    );
  }

  const ageDays = status.sessionUpdatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(status.sessionUpdatedAt).getTime()) / 86_400_000))
    : 0;
  const ageLabel = ageDays === 0 ? "today" : `${ageDays}d`;

  return (
    <span
      className={`flex items-center gap-1 text-xs ${drifting ? "text-amber-400" : "text-violet-400"}`}
      title={drifting ? "High context accumulation — consider resetting" : undefined}
    >
      <Brain className="h-3 w-3" />
      Memory: {ageLabel} · {status.runsSinceReset} run{status.runsSinceReset === 1 ? "" : "s"}
    </span>
  );
}

export function MemoryResetButton({
  agentId,
  agentName,
  status,
  onResetComplete,
}: {
  agentId: string;
  agentName?: string;
  status: MemoryStatus;
  onResetComplete?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!status.enabled || !status.hasSession) return null;

  const drifting = status.runsSinceReset > 20;

  async function handleReset() {
    setResetting(true);
    try {
      await apiFetch(`/api/agents/${agentId}/memory/reset`, { method: "POST" });
      setOpen(false);
      if (onResetComplete) onResetComplete();
      else router.refresh();
    } finally {
      setResetting(false);
    }
  }

  function openDialog(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={openDialog}
        className={`text-xs h-7 ${drifting ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground"}`}
      >
        <RotateCcw className="h-3 w-3" />
        Reset memory
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-violet-400" />
              Reset memory{agentName ? ` for ${agentName}` : ""}
            </DialogTitle>
            <DialogDescription className="pt-1 space-y-2">
              <span className="block">
                The next run will start without any prior chat or run context.
                Chat history stays visible, but the shared Claude session is cleared.
              </span>
              <span className="block text-xs text-muted-foreground">
                Current: carrying{" "}
                <strong className={drifting ? "text-amber-400" : ""}>
                  {status.runsSinceReset} run{status.runsSinceReset === 1 ? "" : "s"}
                </strong>{" "}
                of context.
              </span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset memory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
