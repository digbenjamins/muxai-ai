"use client";
import { useState } from "react";
import { Bell, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";

type NotificationEvent = "decision" | "error" | "run_end";

const EVENT_OPTIONS: { key: NotificationEvent; label: string; description: string }[] = [
  { key: "decision", label: "Decision",  description: "Agent captured a result" },
  { key: "error",    label: "Error",     description: "Run failed" },
  { key: "run_end",  label: "Run End",   description: "Run completed successfully" },
];

interface Props {
  agentId: string;
  adapterConfig: Record<string, unknown>;
  initialNotifyOn: NotificationEvent[];
}

export function NotificationsPanel({ agentId, adapterConfig, initialNotifyOn }: Props) {
  const [open, setOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState<NotificationEvent[]>(initialNotifyOn);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(event: NotificationEvent) {
    setNotifyOn((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        body: JSON.stringify({ adapterConfig: { ...adapterConfig, notifyOn } }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none p-4" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm">Notifications</CardTitle>
            {notifyOn.length > 0 && (
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-medium">
                {notifyOn.length}
              </span>
            )}
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 px-4 pb-4 pt-0">
          <p className="text-xs text-muted-foreground">
            Sends to all enabled channels configured in{" "}
            <Link href="/settings?section=notifications" className="underline hover:text-foreground transition-colors">
              Settings → Notifications
            </Link>
            .
          </p>
          <div className="space-y-3">
            {EVENT_OPTIONS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium leading-none">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <Switch checked={notifyOn.includes(key)} onCheckedChange={() => toggle(key)} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {saved && <span className="text-xs text-emerald-400">Saved</span>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
