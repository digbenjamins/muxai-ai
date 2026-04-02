"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BehaviorInfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none py-3" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          Why is my agent reading files or running commands?
          <span className="ml-auto text-muted-foreground">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-4 text-sm">
          <p className="text-muted-foreground">
            This is normal Claude Code behavior. When an agent lacks clear direction it uses every tool available — Bash, file reads, shell commands — to figure out what to do. The more specific your prompt and SKILL.md, the less it improvises.
          </p>

          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="font-medium text-xs">Vague default prompt</p>
              <p className="text-xs text-muted-foreground">A prompt like <span className="font-mono">"analyze trades"</span> gives no data source, so the agent searches your filesystem for context.</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="font-medium text-xs">No constraints in SKILL.md</p>
              <p className="text-xs text-muted-foreground">Without instructions on what <em>not</em> to do, the agent uses all tools at its disposal freely.</p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="font-medium text-xs">No data source specified</p>
              <p className="text-xs text-muted-foreground">If the agent doesn't know where its data comes from, it will try to find it — usually by reading local files or running shell commands.</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-xs">How to fix it</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground list-disc list-inside">
              <li><span className="text-foreground font-medium">Default Prompt</span> — specify the data source explicitly, e.g. <span className="font-mono text-xs">"Use the orchestrator MCP tool. Do not read local files."</span></li>
              <li><span className="text-foreground font-medium">SKILL.md</span> — add a Constraints section: <span className="font-mono text-xs">"Never run shell commands to gather data."</span></li>
              <li><span className="text-foreground font-medium">Allowed Tools</span> — restrict tool access in Adapter Config to prevent filesystem exploration entirely.</li>
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
