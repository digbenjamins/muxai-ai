"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletPanel } from "./wallet-panel";
import { ResultCardPanel } from "./result-card-panel";
import { NotificationsPanel } from "./notifications-panel";
import type { ResultCardConfig } from "@/lib/result-cards";

interface Props {
  agentId: string;
  adapterConfig: Record<string, unknown>;
  promptTemplate?: string;
  initialCardConfig?: ResultCardConfig;
  initialNotifyOn: string[];
}

export function RightColumn({ agentId, adapterConfig, promptTemplate, initialCardConfig, initialNotifyOn }: Props) {
  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <div className="space-y-4">
      <WalletPanel agentId={agentId} />

      {promptTemplate && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none p-4"
            onClick={() => setPromptOpen((o) => !o)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-sky-400" />
                <CardTitle className="text-sm">Prompt Template</CardTitle>
              </div>
              {promptOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </div>
          </CardHeader>
          {promptOpen && (
            <CardContent className="px-4 pb-4 pt-0">
              <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{promptTemplate}</pre>
            </CardContent>
          )}
        </Card>
      )}

      <ResultCardPanel
        agentId={agentId}
        adapterConfig={adapterConfig}
        initialCardConfig={initialCardConfig}
      />
      <NotificationsPanel
        agentId={agentId}
        adapterConfig={adapterConfig}
        initialNotifyOn={initialNotifyOn as any}
      />
    </div>
  );
}
