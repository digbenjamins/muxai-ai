"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useLogStream, agentColor, formatTime } from "./log-stream-context";
import type { LogEntry } from "./log-stream-context";

export function GlobalLogPanel() {
  const { entries, activeRuns, clear } = useLogStream();
  const [expanded, setExpanded] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [showName, setShowName] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`border-t border-border bg-background transition-all duration-200 ${expanded ? "h-64" : "h-9"} flex-shrink-0 flex flex-col`}>
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-4 h-9 cursor-pointer select-none flex-shrink-0"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-medium text-muted-foreground">Stream</span>
        {activeRuns > 0 && (
          <span className="flex items-center gap-1 text-xs text-blue-500">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            {activeRuns} running
          </span>
        )}
        <span className="ml-auto text-muted-foreground text-xs">{expanded ? "▼" : "▲"}</span>
        {expanded && (
          <>
            <button onClick={(e) => { e.stopPropagation(); setShowTime((v) => !v); }} className={`text-xs px-1.5 py-0.5 rounded ${showTime ? "text-foreground bg-accent" : "text-muted-foreground"}`}>time</button>
            <button onClick={(e) => { e.stopPropagation(); setShowName((v) => !v); }} className={`text-xs px-1.5 py-0.5 rounded ${showName ? "text-foreground bg-accent" : "text-muted-foreground"}`}>name</button>
          </>
        )}
        <Link
          href="/streams"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          open
        </Link>
        {entries.length > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); clear(); }}
          >
            clear
          </button>
        )}
      </div>

      {/* Log content */}
      {expanded && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 pb-2 font-mono text-xs"
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground/50 pt-2">No activity yet. Run an agent to see logs here.</p>
          ) : (
            entries.map((entry) => <LogLine key={entry.id} entry={entry} showTime={showTime} showName={showName} />)
          )}
        </div>
      )}
    </div>
  );
}

export function LogLine({ entry, showTime = true, showName = true }: { entry: LogEntry; showTime?: boolean; showName?: boolean }) {
  const color = agentColor(entry.agentId);

  if (entry.kind === "run_start") {
    return (
      <div className="flex gap-2 py-0.5 text-muted-foreground/60 italic">
        {showTime && <span className="shrink-0">{formatTime(entry.ts)}</span>}
        {showName && <span className={`shrink-0 ${color}`}>{entry.agentName}</span>}
        <span>started</span>
      </div>
    );
  }

  if (entry.kind === "run_end") {
    return (
      <div className={`flex gap-2 py-0.5 italic ${entry.status === "succeeded" ? "text-emerald-500/70" : "text-red-500/70"}`}>
        {showTime && <span className="shrink-0">{formatTime(entry.ts)}</span>}
        {showName && <span className={`shrink-0 ${color}`}>{entry.agentName}</span>}
        <span>{entry.status === "succeeded" ? "✓ succeeded" : "✗ failed"}</span>
      </div>
    );
  }

  if (entry.kind === "tool") {
    return (
      <div className="flex gap-2 py-0.5">
        {showTime && <span className="shrink-0 text-muted-foreground/50">{formatTime(entry.ts)}</span>}
        {showName && <span className={`shrink-0 ${color}`}>{entry.agentName}</span>}
        <span className="text-blue-400/80">{entry.content}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 py-0.5">
      {showTime && <span className="shrink-0 text-muted-foreground/50">{formatTime(entry.ts)}</span>}
      {showName && <span className={`shrink-0 ${color}`}>{entry.agentName}</span>}
      <span className="text-foreground/80 whitespace-pre-wrap">{entry.content}</span>
    </div>
  );
}
