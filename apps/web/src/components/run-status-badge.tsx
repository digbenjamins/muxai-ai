import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/types";

const statusMap: Record<RunStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "running" }> = {
  queued:    { label: "Queued",    variant: "secondary" },
  running:   { label: "Running",   variant: "running" },
  succeeded: { label: "Succeeded", variant: "success" },
  failed:    { label: "Failed",    variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
  timed_out: { label: "Timed Out", variant: "warning" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { label, variant } = statusMap[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}
