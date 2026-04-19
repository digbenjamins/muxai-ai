"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain, FileClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MemoryInfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none py-3" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          What does this agent remember?
          <span className="ml-auto text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-5 text-sm">
          <p className="text-muted-foreground">
            An agent remembers things in two independent ways. They can be used together or separately.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                <p className="font-medium text-xs">Active Memory: OFF (default)</p>
              </div>
              <p className="text-xs text-muted-foreground">Every run is a clean slate. Agent only sees:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>System prompt / SKILL.md</li>
                <li>Default prompt for this run</li>
                <li>Team roster (for leads)</li>
                <li>MCP tools it can call</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                No chat history, no prior run outputs carry into context.
              </p>
            </div>

            <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="h-3 w-3 text-violet-400" />
                <p className="font-medium text-xs">Active Memory: ON</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Everything above <strong>plus a shared Claude session</strong> (via <span className="font-mono">--resume</span>):
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Every chat message with this agent</li>
                <li>Every scheduled run&apos;s transcript (prompts, tool calls, replies)</li>
                <li>Chat &amp; runs share the same session</li>
                <li>Accumulates until you click Reset</li>
              </ul>
            </div>
          </div>

          <div>
            <p className="font-medium text-xs mb-2">How the shared session flows (when Memory is on)</p>
            <div className="rounded-md border border-border bg-muted/20 p-3 font-mono text-xs space-y-1 text-muted-foreground">
              <div>[chat]      user sends message</div>
              <div className="pl-3">↓ Claude runs with --resume &lt;sessionId&gt;</div>
              <div className="pl-3">↓ writes new sessionId to ChatSession</div>
              <div>[heartbeat] scheduled / manual run fires</div>
              <div className="pl-3">↓ reads ChatSession.claudeSessionId</div>
              <div className="pl-3">↓ spawns with --resume &lt;sessionId&gt; + defaultPrompt</div>
              <div className="pl-3">↓ Claude sees: skill + full history + new prompt</div>
              <div className="pl-3">↓ writes new sessionId back to ChatSession</div>
              <div>[chat]      next message picks up where the run left off</div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <FileClock className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="font-medium text-xs">Decisions on demand (separate mechanism)</p>
            </div>
            <p className="text-xs text-muted-foreground">
              The <span className="font-mono">Review Previous Decisions</span> toggle makes the agent call{" "}
              <span className="font-mono">mcp__orchestrator__get_my_decisions</span> at the start of each run.
              This fetches the last ~5 structured result cards — clean decision history without the weight
              of full transcripts.
            </p>
            <p className="text-xs text-muted-foreground">
              Works independently of Active Memory. Useful when you want &ldquo;what did I decide last time&rdquo; but
              don&apos;t want context cost to grow over time.
            </p>
          </div>

          <div>
            <p className="font-medium text-xs mb-2">Quick reference</p>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium p-2"> </th>
                    <th className="text-left font-medium p-2">Memory off</th>
                    <th className="text-left font-medium p-2">Memory on</th>
                    <th className="text-left font-medium p-2">Review Decisions</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-border">
                    <td className="p-2">Chat history</td>
                    <td className="p-2">–</td>
                    <td className="p-2">✓ full</td>
                    <td className="p-2">–</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-2">Prior run transcripts</td>
                    <td className="p-2">–</td>
                    <td className="p-2">✓ full</td>
                    <td className="p-2">–</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-2">Prior decision cards</td>
                    <td className="p-2">–</td>
                    <td className="p-2">✓ (inside transcript)</td>
                    <td className="p-2">✓ last ~5, structured</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-2">Context cost per run</td>
                    <td className="p-2">low</td>
                    <td className="p-2">grows over time</td>
                    <td className="p-2">low (one tool call)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
            <p className="font-medium text-xs">Resets &amp; toggling</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                <strong>Reset memory</strong> — clears the Claude session and bumps the counter anchor.
                Chat messages stay visible; next run starts fresh.
              </li>
              <li>
                <strong>Enabling memory</strong> — treated as a fresh start (same semantics as Reset).
              </li>
              <li>
                <strong>Disabling memory</strong> — stored session is kept but ignored. Re-enabling starts fresh.
              </li>
            </ul>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
            <p className="font-medium text-xs text-amber-500">What memory can&apos;t do</p>
            <p className="text-xs text-muted-foreground">
              Memory preserves context — it doesn&apos;t override the next scheduled run&apos;s default prompt. If you
              tell the agent in chat <span className="font-mono">&ldquo;next run just say hi&rdquo;</span>, it remembers — but when the
              heartbeat fires, it receives its normal scheduled prompt (e.g.{" "}
              <span className="font-mono">&ldquo;analyze BTC&rdquo;</span>) and follows that. Most recent explicit instructions win.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
