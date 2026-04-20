"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/utils";
import type { Agent, AgentStatus } from "@/lib/types";

interface Blip {
  id: string;
  name: string;
  status: AgentStatus;
  angle: number;
  distance: number;
}

function hashAngle(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function distanceForStatus(status: AgentStatus): number {
  switch (status) {
    case "running": return 0.18;
    case "error": return 0.32;
    case "idle": return 0.48;
    case "paused": return 0.68;
    case "terminated": return 0.82;
  }
}

function colorForStatus(status: AgentStatus): string {
  switch (status) {
    case "running": return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse";
    case "error": return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]";
    case "idle": return "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]";
    case "paused": return "bg-zinc-400";
    case "terminated": return "bg-zinc-500/70";
  }
}

interface Props {
  size?: number;
  live?: boolean;
}

export function RadarScope({ size = 160, live = true }: Props) {
  const [blips, setBlips] = useState<Blip[]>([]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    async function load() {
      try {
        const agents = await apiFetch<Agent[]>("/api/agents");
        if (cancelled) return;
        setBlips(
          agents.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            angle: hashAngle(a.id),
            distance: distanceForStatus(a.status),
          })),
        );
      } catch {
        if (!cancelled) setBlips([]);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live]);

  const running = blips.filter((b) => b.status === "running").length;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-full border border-red-500/30 bg-red-500/[0.03] overflow-hidden"
        style={{ width: size, height: size }}
      >
        {/* concentric rings */}
        <div className="absolute inset-[12%] rounded-full border border-red-500/20" />
        <div className="absolute inset-[30%] rounded-full border border-red-500/20" />
        <div className="absolute inset-[48%] rounded-full border border-red-500/20" />
        {/* crosshairs */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-red-500/15" />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-red-500/15" />
        {/* sweep */}
        <div
          className="absolute inset-0 animate-[spin_4s_linear_infinite]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, rgba(239,68,68,0.32) 30deg, transparent 60deg)",
          }}
        />
        {/* blips */}
        {blips.map((blip) => {
          const rad = (blip.angle * Math.PI) / 180;
          const x = 50 + Math.cos(rad) * blip.distance * 50;
          const y = 50 + Math.sin(rad) * blip.distance * 50;
          return (
            <div
              key={blip.id}
              title={`${blip.name} · ${blip.status}`}
              className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${colorForStatus(blip.status)}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          );
        })}
        {/* center dot */}
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] ring-1 ring-red-500/40" />
      </div>
      {live && (
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {blips.length} {blips.length === 1 ? "contact" : "contacts"}
            {running > 0 && <span className="text-amber-500"> · {running} active</span>}
          </div>
        </div>
      )}
    </div>
  );
}
