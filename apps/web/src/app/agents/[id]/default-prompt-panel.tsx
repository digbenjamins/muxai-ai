"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_URL, API_KEY } from "@/lib/utils";

interface Props {
  agentId: string;
  adapterConfig: Record<string, unknown>;
}

export function DefaultPromptPanel({ agentId, adapterConfig }: Props) {
  const initial = adapterConfig.defaultPrompt ? String(adapterConfig.defaultPrompt) : "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
        },
        body: JSON.stringify({
          adapterConfig: { ...adapterConfig, defaultPrompt: value },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(value);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(saved);
    setEditing(false);
    setError(null);
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Default Prompt</span>
          {!editing && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {editing ? (
          <>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter a default prompt (optional)…"
              className="text-sm min-h-[100px] resize-y"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                <Check className="h-3 w-3 mr-1" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancel} disabled={saving}>
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {saved || <span className="italic">No default prompt set.</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
