"use client";
import { useEffect, useState } from "react";
import { Handshake, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { apiFetch, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contractor {
  id: string;
  name: string;
  description?: string | null;
  provider: string;
  model: string;
  baseUrl: string;
  status: "active" | "inactive";
  createdAt: string;
}

// ─── Model presets per provider ───────────────────────────────────────────────

const OPENROUTER_MODELS = [
  { label: "Grok 2", value: "x-ai/grok-2" },
  { label: "Grok Beta", value: "x-ai/grok-beta" },
  { label: "GPT-4o", value: "openai/gpt-4o" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "Gemini 2.0 Flash", value: "google/gemini-2.0-flash-001" },
  { label: "Gemini Pro 1.5", value: "google/gemini-pro-1.5" },
  { label: "Llama 3.1 405B", value: "meta-llama/llama-3.1-405b-instruct" },
  { label: "DeepSeek R1", value: "deepseek/deepseek-r1" },
  { label: "Custom", value: "custom" },
];

const PROVIDERS = [
  { label: "OpenRouter", value: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
];

const BLANK = { name: "", description: "", provider: "openrouter", apiKey: "", model: "", customModel: "" };

// ─── Contract card ────────────────────────────────────────────────────────────

function ContractCard({ contractor, onToggle, onDelete }: {
  contractor: Contractor;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = contractor.status === "active";

  return (
    <Card className={cn("transition-colors", !active && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold uppercase",
              active
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-muted border-border text-muted-foreground"
            )}>
              {contractor.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{contractor.name}</CardTitle>
                <Badge variant={active ? "default" : "secondary"} className="text-xs">
                  {active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <CardDescription className="mt-0.5 truncate">
                {contractor.model} · {contractor.provider}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon" variant="ghost"
              className={cn("h-7 w-7", active ? "text-emerald-400 hover:text-muted-foreground" : "text-muted-foreground hover:text-emerald-400")}
              onClick={onToggle}
              title={active ? "Suspend contract" : "Activate contract"}
            >
              {active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              title="Terminate contract"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground mb-0.5">MCP tool</p>
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono">mcp__contractor__ask_contractor</code>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Endpoint</p>
              <p className="font-mono truncate">{contractor.baseUrl}</p>
            </div>
          </div>
          {contractor.description && (
            <div>
              <p className="text-muted-foreground mb-0.5">Notes</p>
              <p>{contractor.description}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground mb-0.5">Signed</p>
            <p>{new Date(contractor.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="rounded-md bg-muted/50 border border-border p-3 font-mono">
            {`ask_contractor({ name: "${contractor.name}", prompt: "..." })`}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<Contractor[]>("/api/contractors")
      .then(setContractors)
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === form.provider);
  const resolvedModel = form.model === "custom" ? form.customModel : form.model;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedModel) { setError("Please select or enter a model"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/contractors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          provider: form.provider,
          apiKey: form.apiKey.trim(),
          model: resolvedModel.trim(),
          baseUrl: selectedProvider?.baseUrl ?? "https://openrouter.ai/api/v1",
        }),
      });
      setForm(BLANK);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign agreement");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(contractor: Contractor) {
    await apiFetch(`/api/contractors/${contractor.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: contractor.status === "active" ? "inactive" : "active" }),
    });
    load();
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/contractors/${id}`, { method: "DELETE" });
    load();
  }

  const active = contractors.filter((c) => c.status === "active");
  const inactive = contractors.filter((c) => c.status === "inactive");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <Handshake className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-none">Contractors</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hire external models your agents can consult via <code className="font-mono">mcp__contractor__ask_contractor</code>
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          Sign Agreement
        </Button>
      </div>

      {/* Agreement form */}
      {showForm && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Handshake className="h-4 w-4 text-amber-400" />
              New Contractor Agreement
            </CardTitle>
            <CardDescription>
              Register an external model provider. Your agents will be able to consult them during runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Contractor Name *</Label>
                  <Input
                    id="c-name" required
                    placeholder="e.g. Grok, GPT-4o, Gemini"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">This is the name agents use in <code className="font-mono">ask_contractor</code></p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-provider">Provider *</Label>
                  <Select value={form.provider} onValueChange={(v) => set("provider", v)}>
                    <SelectTrigger id="c-provider"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-model">Model *</Label>
                <Select value={form.model} onValueChange={(v) => set("model", v)}>
                  <SelectTrigger id="c-model"><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent>
                    {OPENROUTER_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.model === "custom" && (
                  <Input
                    placeholder="e.g. openai/o1-preview"
                    value={form.customModel}
                    onChange={(e) => set("customModel", e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-key">API Key *</Label>
                <div className="relative">
                  <Input
                    id="c-key" required
                    type={showKey ? "text" : "password"}
                    placeholder="sk-or-..."
                    value={form.apiKey}
                    onChange={(e) => set("apiKey", e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-desc">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="c-desc"
                  placeholder="e.g. Used for news sentiment cross-check"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={saving}>{saving ? "Signing…" : "Sign Contract"}</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setError(null); setForm(BLANK); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Contract list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : contractors.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Handshake className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No contractors hired yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Sign an agreement to give your agents access to external models</p>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Sign Agreement
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest px-1">
                Active Agreements ({active.length})
              </p>
              {active.map((c) => (
                <ContractCard key={c.id} contractor={c} onToggle={() => toggleStatus(c)} onDelete={() => handleDelete(c.id)} />
              ))}
            </div>
          )}
          {inactive.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest px-1">
                Suspended ({inactive.length})
              </p>
              {inactive.map((c) => (
                <ContractCard key={c.id} contractor={c} onToggle={() => toggleStatus(c)} onDelete={() => handleDelete(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
