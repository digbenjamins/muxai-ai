"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentStatus } from "@/lib/types";

interface DeleteButtonProps {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  runCount: number;
}

export function DeleteButton({ agentId, agentName, status, runCount }: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showPurge, setShowPurge] = useState(false);
  const [purgeNameInput, setPurgeNameInput] = useState("");
  const [purgeChecked, setPurgeChecked] = useState(false);

  const isTerminated = status === "terminated";
  const purgeReady = purgeNameInput === agentName && purgeChecked;

  async function handleTerminate() {
    setLoading(true);
    try {
      await apiFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      setShowTerminate(false);
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setLoading(false);
    }
  }

  async function handlePurge() {
    if (!purgeReady) return;
    setLoading(true);
    try {
      await apiFetch(`/api/agents/${agentId}/purge`, { method: "DELETE" });
      setShowPurge(false);
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to purge agent");
      setLoading(false);
    }
  }

  if (isTerminated) {
    return (
      <>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => { setPurgeNameInput(""); setPurgeChecked(false); setShowPurge(true); }}
        >
          <Trash2 className="h-4 w-4" />
          Purge
        </Button>

        <Dialog open={showPurge} onOpenChange={setShowPurge}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Permanently purge agent
              </DialogTitle>
              <DialogDescription className="pt-1">
                This will permanently delete <strong>{agentName}</strong> and all{" "}
                <strong>{runCount} run{runCount !== 1 ? "s" : ""}</strong>. This cannot be undone.
                Any agents that report to this agent will be unlinked.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="purge-name">
                  Type <span className="font-mono font-semibold">{agentName}</span> to confirm
                </Label>
                <Input
                  id="purge-name"
                  value={purgeNameInput}
                  onChange={(e) => setPurgeNameInput(e.target.value)}
                  placeholder={agentName}
                  autoComplete="off"
                />
              </div>

              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={purgeChecked}
                  onChange={(e) => setPurgeChecked(e.target.checked)}
                />
                <span>I understand that all run history and logs will be permanently deleted and this action cannot be undone.</span>
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPurge(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handlePurge}
                disabled={!purgeReady || loading}
              >
                {loading ? "Purging..." : "Purge Agent"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowTerminate(true)}>
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      <Dialog open={showTerminate} onOpenChange={setShowTerminate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will stop <strong>{agentName}</strong> and mark it as terminated. All run history
              is preserved. You can purge the agent later to permanently remove all data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTerminate(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminate} disabled={loading}>
              {loading ? "Deleting..." : "Delete Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
