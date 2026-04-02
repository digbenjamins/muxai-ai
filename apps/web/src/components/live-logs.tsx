"use client";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

interface LiveLogsProps {
  runId: string;
  initialLogs: string;
  initialStatus: RunStatus;
  startedAt?: string | null;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function LiveLogs({ runId, initialLogs, initialStatus, startedAt }: LiveLogsProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [status, setStatus] = useState<RunStatus>(initialStatus);
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : 0
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const isLive = status === "running" || status === "queued";

  useEffect(() => {
    if (!isLive || !startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive, startedAt]);

  useEffect(() => {
    if (!isLive) return;

    const es = new EventSource(`${API_URL}/api/runs/${runId}/stream`);

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "log") {
        setLogs((prev) => prev + event.data);
      } else if (event.type === "done") {
        setStatus(event.status);
        es.close();
      }
    };

    es.onerror = () => es.close();

    return () => es.close();
  }, [runId, isLive]);

  // Auto-scroll to bottom as logs grow
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="relative">
      {isLive && (
        <div className="absolute top-2 right-2 flex items-center gap-2 text-xs">
          {startedAt && (
            <span className="text-muted-foreground">{formatElapsed(elapsed)}</span>
          )}
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live
          </span>
        </div>
      )}
      <pre className="text-xs whitespace-pre-wrap text-muted-foreground bg-muted p-4 rounded-md overflow-x-auto max-h-[65vh] overflow-y-auto">
        {logs || "Waiting for output…"}
        <div ref={bottomRef} />
      </pre>
    </div>
  );
}
