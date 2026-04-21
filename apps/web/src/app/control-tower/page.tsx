import Link from "next/link";
import { Radar, MessageSquare, Settings2, Bot, Radio } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SetupButton } from "./setup-button";
import { RadarScope } from "./radar-scope";
import { TelegramTile } from "./telegram-tile";

interface ControlTowerAgent {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: "idle" | "running" | "paused" | "error" | "terminated";
  capabilities: string | null;
  adapterConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ControlTowerResponse {
  agent: ControlTowerAgent | null;
  messageCount: number;
}

async function getControlTower(): Promise<ControlTowerResponse> {
  try {
    return await apiFetch<ControlTowerResponse>("/api/control-tower");
  } catch {
    return { agent: null, messageCount: 0 };
  }
}

export default async function ControlTowerPage() {
  const { agent, messageCount } = await getControlTower();

  return (
    <div className="space-y-5">
      <TowerHeader online={!!agent} status={agent?.status ?? null} />
      {!agent ? <EmptyState /> : <LoadedState agent={agent} messageCount={messageCount} />}
    </div>
  );
}

function TowerHeader({ online, status }: { online: boolean; status: ControlTowerAgent["status"] | null }) {
  const indicator = !online
    ? { color: "bg-muted-foreground/50", label: "OFFLINE" }
    : status === "running"
      ? { color: "bg-amber-500 animate-pulse", label: "ACTIVE" }
      : status === "error"
        ? { color: "bg-red-500", label: "FAULT" }
        : status === "paused"
          ? { color: "bg-muted-foreground", label: "STANDBY" }
          : { color: "bg-emerald-500", label: "ONLINE" };

  return (
    <div className="relative overflow-hidden rounded-lg border border-red-500/20 bg-gradient-to-br from-red-500/5 via-card to-card">
      <div
        className="absolute inset-0 pointer-events-none opacity-60 dark:opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(239,68,68,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-500 ring-1 ring-red-500/30">
            <Radar className="h-6 w-6" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${indicator.color}`} />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-red-500/80">
              <span>TWR-01</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{indicator.label}</span>
            </div>
            <h1 className="text-xl font-semibold leading-tight mt-0.5">Control Tower</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Singleton admin agent · full visibility across every agent on your deployment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-red-500/30">
      <CardContent className="flex flex-col items-center text-center py-16 space-y-5">
        <RadarScope size={120} live={false} />
        <div className="space-y-1.5 max-w-md">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">TOWER NOT COMMISSIONED</div>
          <h2 className="text-lg font-semibold">No signal on this frequency</h2>
          <p className="text-sm text-muted-foreground">
            The Control Tower is the single conversational entry point for this muxAI deployment.
            One admin agent that can see every other agent, invoke runs, and report back — in chat
            today, over external gateways later.
          </p>
        </div>
        <SetupButton />
      </CardContent>
    </Card>
  );
}

function LoadedState({ agent, messageCount }: { agent: ControlTowerAgent; messageCount: number }) {
  const model = String((agent.adapterConfig as Record<string, unknown>)?.model ?? "—");
  const activatedAt = new Date(agent.createdAt);
  const daysOnline = Math.max(0, Math.floor((Date.now() - activatedAt.getTime()) / 86400000));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        {/* Primary status panel */}
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Callsign</div>
                <div className="text-lg font-semibold mt-0.5">{agent.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{agent.title || "Admin agent"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href={`/agents/${agent.id}`}>
                    <Bot className="h-4 w-4" />
                    Details
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href={`/agents/${agent.id}/edit`}>
                    <Settings2 className="h-4 w-4" />
                    Configure
                  </Link>
                </Button>
                <Button asChild size="sm" className="gap-1.5 bg-red-500/90 hover:bg-red-500 text-white">
                  <Link href={`/chat?agent=${agent.id}`}>
                    <MessageSquare className="h-4 w-4" />
                    Open chat
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
              <Readout label="Status" value={statusLabel(agent.status)} dot={statusColor(agent.status)} />
              <Readout label="Model" value={model} mono />
              <Readout label="Messages" value={String(messageCount)} mono />
              <Readout label="Uptime" value={`${daysOnline}d`} mono />
            </div>
          </CardContent>
        </Card>

        {/* Radar scope */}
        <Card className="hidden md:block">
          <CardContent className="p-5 flex flex-col items-center justify-center gap-3 h-full min-w-[200px]">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Sector scan
            </div>
            <RadarScope size={160} />
          </CardContent>
        </Card>
      </div>

      {/* Comms channels */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Comms channels</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ChannelTile icon={MessageSquare} label="In-app chat" state="online" description="Live browser session — currently active." />
          <TelegramTile />
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: ControlTowerAgent["status"]): string {
  switch (status) {
    case "idle": return "Online";
    case "running": return "Active";
    case "paused": return "Standby";
    case "error": return "Fault";
    case "terminated": return "Offline";
  }
}

function statusColor(status: ControlTowerAgent["status"]): string {
  switch (status) {
    case "idle": return "bg-emerald-500";
    case "running": return "bg-amber-500 animate-pulse";
    case "paused": return "bg-muted-foreground";
    case "error": return "bg-red-500";
    case "terminated": return "bg-muted-foreground/50";
  }
}

function Readout({ label, value, mono, dot }: { label: string; value: string; mono?: boolean; dot?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium truncate flex items-center gap-2 ${mono ? "font-mono" : ""}`}>
        {dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />}
        {value}
      </span>
    </div>
  );
}

function ChannelTile({
  icon: Icon,
  label,
  description,
  state,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  state: "online" | "standby";
}) {
  const isOnline = state === "online";
  return (
    <Card className={isOnline ? "border-emerald-500/40" : "opacity-70"}>
      <CardContent className="py-4 px-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${isOnline ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span className="font-medium text-sm">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isOnline ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-muted-foreground/50"
              }`}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              {isOnline ? "Online" : "Standby"}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
