"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AGENT_TEMPLATES, SKILL_PLACEHOLDER, type AgentTemplate } from "@/lib/agent-templates";
import { PlusCircle } from "lucide-react";

interface McpTool {
  name: string;
  fullName: string;
  description: string;
}
interface McpServer {
  id: string;
  label: string;
  description: string;
  command: string;
  args: string[];
  tools: McpTool[];
}
interface McpRegistryResponse {
  rootPath: string;
  servers: McpServer[];
}

interface AgentRole {
  id: string;
  name: string;
  description?: string | null;
}

const SCHEDULE_PRESETS = [
  { label: "Disabled", value: "disabled" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 4 hours", value: "0 */4 * * *" },
  { label: "Every 8 hours", value: "0 */8 * * *" },
  { label: "Every day (midnight)", value: "0 0 * * *" },
  { label: "Custom cron", value: "custom" },
];

function StepHeader({ step, title, description }: { step: number; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 p-6 pb-0">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">{step}</div>
      <div>
        <p className="font-semibold text-sm leading-none">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  );
}

export default function NewAgentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcpPreset, setMcpPreset] = useState("builtin");
  const [schedulePreset, setSchedulePreset] = useState("disabled");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [builtInServers, setBuiltInServers] = useState<McpServer[]>([]);
  const [mcpRootPath, setMcpRootPath] = useState("");
  const [agents, setAgents] = useState<{ id: string; name: string; role: string }[]>([]);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [reportsToId, setReportsToId] = useState<string>("none");
  const [useChrome, setUseChrome] = useState(false);
  const [persistLogs, setPersistLogs] = useState(true);

  useEffect(() => {
    apiFetch<McpRegistryResponse>("/api/mcp-servers")
      .then(({ rootPath, servers }) => {
        setMcpRootPath(rootPath);
        setBuiltInServers(servers);
        set("cwd", rootPath); // builtin is the default — pre-set cwd
      })
      .catch(() => {});
    apiFetch<{ id: string; name: string; role: string }[]>("/api/agents")
      .then(setAgents)
      .catch(() => {});
    apiFetch<AgentRole[]>("/api/roles")
      .then(setRoles)
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: "",
    role: "general",
    title: "",
    capabilities: "",
    model: "claude-sonnet-4-6",
    effort: "none",
    cwd: "",
    allowedTools: "",
    promptTemplate: "",
    defaultPrompt: "",
    maxTurnsPerRun: "10",
    customCron: "",
  });

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function applyTemplate(template: AgentTemplate) {
    setSelectedTemplate(template.id);
    setForm((f) => ({
      ...f,
      ...template.form,
      promptTemplate: "",
      defaultPrompt: template.defaultPrompt ?? "",
      cwd: template.mcpPreset === "builtin" ? mcpRootPath : template.form.cwd,
    }));
    setUseChrome(template.useChrome ?? false);
    setPersistLogs(template.persistLogs ?? false);
    setMcpPreset(template.mcpPreset);
    setSchedulePreset(template.schedulePreset);
    const res = await fetch(`/api/templates/${template.id}`);
    if (res.ok) {
      const { content } = await res.json();
      setForm((f) => ({ ...f, promptTemplate: content }));
    }
  }

  function clearTemplate() {
    setSelectedTemplate(null);
    setForm({
      name: "",
      role: "general",
      title: "",
      capabilities: "",
      model: "claude-sonnet-4-6",
      effort: "none",
      cwd: "",
      allowedTools: "",
      promptTemplate: "",
      defaultPrompt: "",
      maxTurnsPerRun: "10",
      customCron: "",
    });
    setUseChrome(false);
    setPersistLogs(false);
    setMcpPreset("builtin");
    set("cwd", mcpRootPath);
    setSchedulePreset("disabled");
  }

  function handleMcpPreset(value: string) {
    setMcpPreset(value);
    if (value === "builtin") {
      set("allowedTools", "");
      set("cwd", mcpRootPath);
    } else {
      set("allowedTools", "");
      set("cwd", "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const agent = await apiFetch<{ id: string }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          title: form.title || undefined,
          capabilities: form.capabilities || undefined,
          reportsToId: reportsToId && reportsToId !== "none" ? reportsToId : undefined,
          adapterType: "claude_local",
          adapterConfig: {
            model: form.model,
            effort: form.effort !== "none" ? form.effort : undefined,
            cwd: form.cwd || undefined,
            allowedTools: form.allowedTools || undefined,
            promptTemplate: form.promptTemplate || undefined,
            defaultPrompt: form.defaultPrompt || undefined,
            useChrome: useChrome || undefined,
            persistLogs: persistLogs || undefined,
            maxTurnsPerRun: Number(form.maxTurnsPerRun),
            ...(selectedTemplate ? (() => {
              const tpl = AGENT_TEMPLATES.find((t) => t.id === selectedTemplate);
              return tpl?.resultCard ? { resultCard: tpl.resultCard } : {};
            })() : {}),
          },
          runtimeConfig:
            schedulePreset !== "disabled"
              ? {
                  heartbeat: {
                    enabled: true,
                    cron: schedulePreset === "custom" ? form.customCron : schedulePreset,
                  },
                }
              : {},
        }),
      });
      router.push(`/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
          <PlusCircle className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-none">New Agent</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Configure a new agent. You can customise it further after creation.</p>
        </div>
      </div>

      {/* Template picker */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Start from a template</p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={clearTemplate}
            className={cn(
              "px-3 py-1.5 rounded-md border text-sm transition-colors",
              selectedTemplate === null ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50 hover:bg-muted",
            )}
          >
            Blank
          </button>
          {AGENT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              title={t.description}
              className={cn(
                "px-3 py-1.5 rounded-md border text-sm transition-colors",
                selectedTemplate === t.id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50 hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1 — Identity + Adapter + MCP */}
        <div className="grid grid-cols-3 gap-4 items-stretch">
          {/* Step 1: Identity */}
          <Card>
            <StepHeader step={1} title="Identity" description="Who is this agent?" />
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. News Analyst" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.name} className="capitalize">
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Title <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Senior Crypto News Analyst" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capabilities">
                  Capabilities <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="capabilities"
                  value={form.capabilities}
                  onChange={(e) => set("capabilities", e.target.value)}
                  placeholder="Describe what this agent is good at..."
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reportsTo">
                  Reports To <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select value={reportsToId} onValueChange={setReportsToId}>
                  <SelectTrigger id="reportsTo">
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} <span className="text-muted-foreground capitalize">({a.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Adapter */}
          <Card>
            <StepHeader step={2} title="Adapter Config" description="How the agent is invoked" />
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <Select value={form.model} onValueChange={(v) => set("model", v)}>
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
                    <SelectItem value="claude-opus-4-6">Claude Opus 4.6</SelectItem>
                    <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="effort">Effort</Label>
                <Select value={form.effort} onValueChange={(v) => set("effort", v)}>
                  <SelectTrigger id="effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls thinking depth via <code className="font-mono">--effort</code>. Default lets Claude decide.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxTurns">Max Turns Per Run</Label>
                <Input id="maxTurns" type="number" min={1} max={100} value={form.maxTurnsPerRun} onChange={(e) => set("maxTurnsPerRun", e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="useChrome">Chrome Browser</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable browser automation via <code className="font-mono">--chrome</code>
                  </p>
                </div>
                <Switch id="useChrome" checked={useChrome} onCheckedChange={setUseChrome} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="persistLogs">Stream History</Label>
                  <p className="text-xs text-muted-foreground">Show this agent's logs in the Stream panel and history</p>
                </div>
                <Switch id="persistLogs" checked={persistLogs} onCheckedChange={setPersistLogs} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt">
                  SKILL.md <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="prompt"
                  value={form.promptTemplate}
                  onChange={(e) => set("promptTemplate", e.target.value)}
                  placeholder={SKILL_PLACEHOLDER}
                  rows={12}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultPrompt">
                  Default Prompt <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="defaultPrompt"
                  value={form.defaultPrompt}
                  onChange={(e) => set("defaultPrompt", e.target.value)}
                  placeholder={"Analyze BTC/USDT on the 4h timeframe and provide a trade decision."}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  The task passed to the agent on every run. Use this for runtime context like asset, timeframe, or extra instructions.
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Step 3: MCP & Workspace */}
          <Card>
            <StepHeader step={3} title="MCP & Workspace" description="Tools and environment" />
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="mcpPreset">MCP Servers</Label>
                <Select value={mcpPreset} onValueChange={handleMcpPreset}>
                  <SelectTrigger id="mcpPreset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (~/.claude config)</SelectItem>
                    <SelectItem value="builtin">Built-in (muxai-io servers)</SelectItem>
                  </SelectContent>
                </Select>
                {mcpPreset === "builtin" && (
                  <p className="text-xs text-muted-foreground">
                    Agent gets access to all built-in MCP servers. See the{" "}
                    <a href="/mcp-servers" className="underline">
                      MCP Servers
                    </a>{" "}
                    page for what's available.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cwd">
                  Workspace Directory <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="cwd"
                  value={form.cwd}
                  onChange={(e) => set("cwd", e.target.value)}
                  placeholder="/path/to/workspace"
                  readOnly={mcpPreset === "builtin"}
                  className={mcpPreset === "builtin" ? "opacity-60 cursor-not-allowed" : ""}
                />
                {mcpPreset === "builtin" ? (
                  <p className="text-xs text-muted-foreground">Auto-set to the muxai-io root so built-in MCP servers are discoverable.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Override the default working directory for this agent.</p>
                )}
              </div>
            </CardContent>

            <StepHeader step={4} title="Schedule" description="Run this agent automatically on a timer" />
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-full">
                  <Select value={schedulePreset} onValueChange={setSchedulePreset}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {schedulePreset === "custom" && <Input value={form.customCron} onChange={(e) => set("customCron", e.target.value)} placeholder="*/30 * * * *" />}
              {schedulePreset !== "disabled" && schedulePreset !== "custom" && <p className="text-xs text-muted-foreground font-mono">{schedulePreset}</p>}
              {schedulePreset !== "disabled" && (
                <p className="text-xs text-muted-foreground">
                  The agent will be invoked automatically on this schedule. It will skip a run if it is already running.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Agent"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
