"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { API_URL, API_KEY } from "@/lib/utils";

interface InvokeInfo {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  mcpMode: "builtin" | "global";
  mcpConfig: { mcpServers: Record<string, unknown> } | null;
  model: string;
  maxTurns: number;
  systemPrompt: string | null;
  defaultPrompt: string;
}

export function InvokeInfoPanel({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<InvokeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!open && !info) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/agents/${agentId}/invoke-info`, {
          headers: { ...(API_KEY ? { "X-Api-Key": API_KEY } : {}) },
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? "Failed to load invocation info");
        } else {
          setInfo(data);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  }

  const commandLine = info
    ? [info.command, ...(Array.isArray(info.args) ? info.args : [])]
        .filter((a): a is string => typeof a === "string")
        .map((a) => (a.startsWith("<") || a.includes(" ") ? `"${a}"` : a))
        .join(" \\\n  ")
    : null;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none py-3"
        onClick={toggle}
      >
        <CardTitle className="text-sm flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          Invocation
          {loading && <span className="text-xs text-muted-foreground ml-1">Loading…</span>}
          <span className="ml-auto text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {open && error && (
        <CardContent className="pt-0">
          <p className="text-xs text-destructive">{error}</p>
        </CardContent>
      )}
      {open && info && (
        <CardContent className="space-y-4 pt-0">
          {/* Command */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Command</p>
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {commandLine}
            </pre>
          </div>

          {/* CWD + MCP mode */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <span><span className="text-muted-foreground">cwd </span>{info.cwd}</span>
            <span>
              <span className="text-muted-foreground">mcp </span>
              <Badge variant={info.mcpMode === "builtin" ? "default" : "secondary"} className="text-xs py-0 px-1.5">
                {info.mcpMode}
              </Badge>
            </span>
          </div>

          {/* Env vars */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Environment</p>
            <div className="space-y-1">
              {Object.entries(info.env ?? {}).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[auto_1fr] gap-2 text-xs font-mono">
                  <span className="text-indigo-400 shrink-0">{k}</span>
                  <span className="text-muted-foreground truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MCP servers */}
          {info.mcpConfig && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                MCP Servers ({Object.keys(info.mcpConfig.mcpServers).length})
              </p>
              <div className="space-y-0.5">
                {Object.entries(info.mcpConfig.mcpServers).map(([name, cfg]) => {
                  const c = cfg as Record<string, unknown>;
                  const detail = c.type === "http"
                    ? String(c.url)
                    : `${String(c.command)} ${(c.args as string[] | undefined)?.join(" ") ?? ""}`.trim();
                  return (
                    <div key={name} className="grid grid-cols-[auto_1fr] gap-2 text-xs font-mono">
                      <span className="text-emerald-400 shrink-0">{name}</span>
                      <span className="text-muted-foreground truncate">{detail}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* System prompt */}
          {info.systemPrompt && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">System Prompt (resolved)</p>
              <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                {info.systemPrompt}
              </pre>
            </div>
          )}

          {/* Default prompt */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Default Prompt (--print)</p>
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-32 leading-relaxed">
              {info.defaultPrompt}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
