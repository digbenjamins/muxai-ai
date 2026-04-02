import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "@/lib/types";

const statusMap: Record<AgentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "running" }> = {
  idle:       { label: "Idle",       variant: "secondary" },
  running:    { label: "Running",    variant: "running" },
  paused:     { label: "Paused",     variant: "warning" },
  error:      { label: "Error",      variant: "destructive" },
  terminated: { label: "Terminated", variant: "outline" },
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const { label, variant } = statusMap[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}
