"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Check, ExternalLink, X, Trash2 } from "lucide-react";
import { API_URL, API_KEY, apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type GatewayState = "disconnected" | "pairing" | "connected";

interface Status {
  state: GatewayState;
  botUsername?: string;
  ownerUsername?: string;
  ownerChatId?: number;
  connectedAt?: string;
  polling: boolean;
}

async function apiSend<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export function TelegramTile() {
  const [status, setStatus] = useState<Status>({ state: "disconnected", polling: false });
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  async function refresh() {
    try {
      const s = await apiFetch<Status>("/api/control-tower/gateways/telegram");
      setStatus(s);
    } catch {
      setStatus({ state: "disconnected", polling: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // While pairing, poll every 2s so the UI reflects the first /start.
  useEffect(() => {
    if (status.state !== "pairing") return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [status.state]);

  return (
    <>
      <Tile status={status} loading={loading} onConnect={() => setWizardOpen(true)} onDisconnect={() => setDisconnectOpen(true)} />
      <TelegramWizard
        open={wizardOpen}
        initialStatus={status}
        onClose={() => { setWizardOpen(false); refresh(); }}
      />
      <DisconnectConfirm
        open={disconnectOpen}
        ownerUsername={status.ownerUsername}
        botUsername={status.botUsername}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={async () => {
          await apiSend("/api/control-tower/gateways/telegram", { method: "DELETE" }).catch(() => {});
          setDisconnectOpen(false);
          refresh();
        }}
      />
    </>
  );
}

function Tile({
  status,
  loading,
  onConnect,
  onDisconnect,
}: {
  status: Status;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isOnline = status.state === "connected";
  const isPairing = status.state === "pairing";
  const accent = isOnline ? "border-emerald-500/40" : isPairing ? "border-amber-500/40" : "";

  return (
    <Card className={accent}>
      <CardContent className="py-4 px-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className={`h-4 w-4 ${isOnline ? "text-emerald-500" : isPairing ? "text-amber-500" : "text-muted-foreground"}`} />
            <span className="font-medium text-sm">Telegram</span>
          </div>
          <StateDot state={status.state} />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed min-h-[32px]">
          {loading
            ? "Loading…"
            : isOnline
              ? `Paired with @${status.ownerUsername || "operator"} · bot @${status.botUsername || "?"}`
              : isPairing
                ? `Waiting for you to send /start to @${status.botUsername || "bot"}…`
                : "Bot webhook — reach your agents from your phone."}
        </p>
        <div className="flex items-center gap-2 pt-1">
          {status.state === "disconnected" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onConnect}>
              Connect
            </Button>
          )}
          {status.state === "pairing" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onConnect}>
                Open setup
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-400" onClick={onDisconnect}>
                Cancel
              </Button>
            </>
          )}
          {status.state === "connected" && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-400 gap-1" onClick={onDisconnect}>
              <Trash2 className="h-3 w-3" />
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StateDot({ state }: { state: GatewayState }) {
  if (state === "connected") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Online</span>
      </div>
    );
  }
  if (state === "pairing") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Pairing</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Standby</span>
    </div>
  );
}

function TelegramWizard({
  open,
  initialStatus,
  onClose,
}: {
  open: boolean;
  initialStatus: Status;
  onClose: () => void;
}) {
  // Step 1: enter + validate token. Step 2: wait for /start. Step 3: done.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [token, setToken] = useState("");
  const [validating, setValidating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | undefined>();
  const [ownerUsername, setOwnerUsername] = useState<string | undefined>();
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // When dialog opens, resume from current server state.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setToken("");
    setValidating(false);
    setConnecting(false);
    if (initialStatus.state === "connected") {
      setStep(3);
      setBotUsername(initialStatus.botUsername);
      setOwnerUsername(initialStatus.ownerUsername);
    } else if (initialStatus.state === "pairing") {
      setStep(2);
      setBotUsername(initialStatus.botUsername);
    } else {
      setStep(1);
      setBotUsername(undefined);
      setOwnerUsername(undefined);
    }
  }, [open, initialStatus]);

  // Poll for owner pair while on step 2.
  useEffect(() => {
    if (!open || step !== 2) return;
    async function check() {
      try {
        const s = await apiFetch<Status>("/api/control-tower/gateways/telegram");
        if (s.state === "connected") {
          setOwnerUsername(s.ownerUsername);
          setBotUsername(s.botUsername);
          setStep(3);
        }
      } catch {
        /* ignore */
      }
    }
    check();
    pollTimer.current = setInterval(check, 2000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [open, step]);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      const res = await apiSend<Status>("/api/control-tower/gateways/telegram", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      setBotUsername(res.botUsername);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function handleValidate() {
    if (!token.trim()) return;
    setError(null);
    setValidating(true);
    try {
      const res = await apiSend<{ botUsername: string }>("/api/control-tower/gateways/telegram/validate", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      setBotUsername(res.botUsername);
    } catch (err) {
      setBotUsername(undefined);
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function handleCancelAndClose() {
    // If we're mid-pairing, wipe the config so we don't leave a poller running.
    if (step === 2) {
      await apiSend("/api/control-tower/gateways/telegram", { method: "DELETE" }).catch(() => {});
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancelAndClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-500" />
            <DialogTitle>Connect Telegram</DialogTitle>
          </div>
          <DialogDescription>
            Step {step} of 3 · talk to your Control Tower from your phone
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground">1. Create a bot with BotFather</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline inline-flex items-center gap-0.5">@BotFather<ExternalLink className="h-3 w-3" /></a> in Telegram</li>
                <li>Send <code className="font-mono text-[11px] bg-background px-1 py-0.5 rounded">/newbot</code> and follow the prompts</li>
                <li>Copy the HTTP API token (looks like <code className="font-mono text-[10px]">123456:ABC-DEF…</code>)</li>
              </ol>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg-token">Bot token</Label>
              <Input
                id="tg-token"
                type="password"
                placeholder="123456789:AA…"
                value={token}
                onChange={(e) => { setToken(e.target.value); setBotUsername(undefined); setError(null); }}
                autoComplete="off"
              />
              {botUsername && (
                <p className="text-xs text-emerald-500 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Looks good — bot @{botUsername}
                </p>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={handleValidate} disabled={!token.trim() || validating}>
                {validating ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                Validate
              </Button>
              <Button size="sm" onClick={handleConnect} disabled={!token.trim() || connecting}>
                {connecting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                Save & continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
              <p className="text-sm font-medium">Waiting for /start</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open{" "}
                {botUsername ? (
                  <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline inline-flex items-center gap-0.5">
                    t.me/{botUsername}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "your bot"
                )}{" "}
                and send <code className="font-mono text-[11px] bg-background px-1 py-0.5 rounded">/start</code>.
                The first person to send /start claims ownership.
              </p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-center space-y-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto ring-1 ring-emerald-500/40">
                <Check className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">Connected</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your Control Tower is reachable on Telegram{ownerUsername ? <> as <span className="text-foreground">@{ownerUsername}</span></> : null}.
                Send it a message any time.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="ghost" size="sm" onClick={handleCancelAndClose} className="text-red-500 hover:text-red-400 gap-1">
              <X className="h-3 w-3" />
              Cancel setup
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" onClick={onClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`flex-1 h-1 rounded-full transition-colors ${
            n < step ? "bg-emerald-500" : n === step ? "bg-emerald-500/60" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function DisconnectConfirm({
  open,
  ownerUsername,
  botUsername,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  ownerUsername?: string;
  botUsername?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disconnect Telegram?</DialogTitle>
          <DialogDescription>
            Stop the poller and remove the stored bot token. The owner
            {ownerUsername ? <> (@{ownerUsername})</> : null}
            {botUsername ? <> and bot @{botUsername}</> : null} will be forgotten.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="bg-red-500 hover:bg-red-500/90 text-white" onClick={onConfirm}>
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
