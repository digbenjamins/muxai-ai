"use client";
import { useEffect, useRef, useState } from "react";
import { API_URL, API_KEY, apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Copy, RefreshCw, Check, KeyRound, EyeOff } from "lucide-react";

interface WalletInfo {
  address: string | null;
  solBalance: number | null;
  usdcBalance: number | null;
  network: string;
  addressEvm: string | null;
  ethBalance: number | null;
  usdcBalanceBase: number | null;
  baseNetwork: string;
}

function TruncatedAddress({ address, onCopy, copied }: { address: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <code className="text-xs font-mono text-foreground/80 truncate">
        {address.slice(0, 6)}…{address.slice(-4)}
      </code>
      <button onClick={onCopy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy address">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function WalletPanel({ agentId }: { agentId: string }) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Copy state for addresses
  const [copiedSol, setCopiedSol] = useState(false);
  const [copiedEvm, setCopiedEvm] = useState(false);

  // Solana key export
  const [exportedSolKey, setExportedSolKey] = useState<string | null>(null);
  const [solKeyCopied, setSolKeyCopied] = useState(false);
  const [exportingSol, setExportingSol] = useState(false);
  const solHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // EVM key export
  const [exportedEvmKey, setExportedEvmKey] = useState<string | null>(null);
  const [evmKeyCopied, setEvmKeyCopied] = useState(false);
  const [exportingEvm, setExportingEvm] = useState(false);
  const evmHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    try {
      const data = await apiFetch<WalletInfo>(`/api/agents/${agentId}/wallet`);
      setWallet((prev) => ({
        ...data,
        solBalance: data.solBalance ?? prev?.solBalance ?? null,
        usdcBalance: data.usdcBalance ?? prev?.usdcBalance ?? null,
        ethBalance: data.ethBalance ?? prev?.ethBalance ?? null,
        usdcBalanceBase: data.usdcBalanceBase ?? prev?.usdcBalanceBase ?? null,
      }));
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [agentId]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch(`${API_URL}/api/agents/${agentId}/wallet`, {
        method: "POST",
        headers: { ...(API_KEY ? { "X-Api-Key": API_KEY } : {}) },
      });
      await load();
    } finally { setGenerating(false); }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleExportSol() {
    setExportingSol(true);
    try {
      const data = await apiFetch<{ secretKeyBase58: string }>(`/api/agents/${agentId}/wallet/export`, { method: "POST" });
      setExportedSolKey(data.secretKeyBase58);
      if (solHideTimer.current) clearTimeout(solHideTimer.current);
      solHideTimer.current = setTimeout(() => setExportedSolKey(null), 30_000);
    } catch {}
    finally { setExportingSol(false); }
  }

  async function handleExportEvm() {
    setExportingEvm(true);
    try {
      const data = await apiFetch<{ privateKey: string }>(`/api/agents/${agentId}/wallet/export/evm`, { method: "POST" });
      setExportedEvmKey(data.privateKey);
      if (evmHideTimer.current) clearTimeout(evmHideTimer.current);
      evmHideTimer.current = setTimeout(() => setExportedEvmKey(null), 30_000);
    } catch {}
    finally { setExportingEvm(false); }
  }

  function copy(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  if (loading) return null;

  const hasWallet = wallet?.address || wallet?.addressEvm;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          Wallet
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Refresh balances"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasWallet ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No wallets yet.</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {generating ? "Generating…" : "Generate Wallets"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Solana ── */}
            {wallet?.address && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Solana</span>
                  {wallet.network && (
                    <span className="text-xs text-muted-foreground/40">{wallet.network}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <TruncatedAddress
                    address={wallet.address}
                    onCopy={() => copy(wallet.address!, setCopiedSol)}
                    copied={copiedSol}
                  />
                  <div className="h-3 w-px bg-border shrink-0" />
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground/60">SOL</p>
                      <p className="text-sm font-semibold">{wallet.solBalance === null ? "—" : wallet.solBalance.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60">USDC</p>
                      <p className="text-sm font-semibold">{wallet.usdcBalance === null ? "—" : `$${wallet.usdcBalance.toFixed(2)}`}</p>
                    </div>
                  </div>
                </div>
                {/* Solana export */}
                <div className="pt-1 border-t border-border/50">
                  {!exportedSolKey ? (
                    <button
                      onClick={handleExportSol}
                      disabled={exportingSol}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {exportingSol ? "Decrypting…" : "Export private key"}
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-yellow-500/80">⚠ Keep this secret</p>
                        <button onClick={() => { setExportedSolKey(null); if (solHideTimer.current) clearTimeout(solHideTimer.current); }} className="text-muted-foreground hover:text-foreground transition-colors">
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 rounded-md bg-muted/60 border border-border px-2 py-1.5">
                        <code className="text-xs font-mono text-foreground/70 break-all flex-1">{exportedSolKey}</code>
                        <button onClick={() => copy(exportedSolKey, setSolKeyCopied)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                          {solKeyCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground/50">Hides automatically in 30s</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Base / EVM ── */}
            {wallet?.addressEvm && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Base</span>
                  {wallet.baseNetwork && (
                    <span className="text-xs text-muted-foreground/40">{wallet.baseNetwork}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <TruncatedAddress
                    address={wallet.addressEvm}
                    onCopy={() => copy(wallet.addressEvm!, setCopiedEvm)}
                    copied={copiedEvm}
                  />
                  <div className="h-3 w-px bg-border shrink-0" />
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground/60">ETH</p>
                      <p className="text-sm font-semibold">{wallet.ethBalance === null ? "—" : wallet.ethBalance.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60">USDC</p>
                      <p className="text-sm font-semibold">{wallet.usdcBalanceBase === null ? "—" : `$${wallet.usdcBalanceBase.toFixed(2)}`}</p>
                    </div>
                  </div>
                </div>
                {/* EVM export */}
                <div className="pt-1 border-t border-border/50">
                  {!exportedEvmKey ? (
                    <button
                      onClick={handleExportEvm}
                      disabled={exportingEvm}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {exportingEvm ? "Decrypting…" : "Export private key"}
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-yellow-500/80">⚠ Keep this secret</p>
                        <button onClick={() => { setExportedEvmKey(null); if (evmHideTimer.current) clearTimeout(evmHideTimer.current); }} className="text-muted-foreground hover:text-foreground transition-colors">
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 rounded-md bg-muted/60 border border-border px-2 py-1.5">
                        <code className="text-xs font-mono text-foreground/70 break-all flex-1">{exportedEvmKey}</code>
                        <button onClick={() => copy(exportedEvmKey, setEvmKeyCopied)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                          {evmKeyCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground/50">Hides automatically in 30s</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
