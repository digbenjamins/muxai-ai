import type { NotificationPayload } from "../notifications";

const COLORS = {
  LONG:    0x10b981, // emerald
  SHORT:   0xef4444, // red
  WAIT:    0xf59e0b, // amber
  APPROVE: 0x10b981, // emerald
  REJECT:  0xef4444, // red
  decision:0x6366f1, // indigo fallback
  error:   0xef4444,
  run_end: 0x64748b,
};

// Fields handled as dedicated embed fields in trade format
const TRADE_FIELDS = new Set(["decision", "asset", "timeframe", "entry", "take_profit", "stop_loss", "risk_reward", "confidence", "technical_summary", "news_summary", "consensus", "conflict", "invalidation", "watch_for"]);

function decisionColor(result: Record<string, unknown>): number {
  const d = String(result.decision ?? "").toUpperCase();
  return (COLORS as Record<string, number>)[d] ?? COLORS.decision;
}

function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((item) => `• ${item}`).join("\n");
  if (typeof v === "object" && v !== null) return "```json\n" + JSON.stringify(v, null, 2).slice(0, 900) + "\n```";
  return String(v);
}

function formatDecision(payload: NotificationPayload): object {
  const r = payload.resultJson ?? {};
  const decision = String(r.decision ?? "RESULT").toUpperCase();
  const asset = r.asset ? String(r.asset) : "";
  const timeframe = r.timeframe ? String(r.timeframe) : "";
  const titleParts = [decision, asset, timeframe].filter(Boolean);

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  // ── Trade-specific structured fields ──────────────────────────────────────
  if (r.entry != null)       fields.push({ name: "Entry",       value: `\`${r.entry}\``,       inline: true });
  if (r.take_profit != null) fields.push({ name: "Take Profit", value: `\`${r.take_profit}\``, inline: true });
  if (r.stop_loss != null)   fields.push({ name: "Stop Loss",   value: `\`${r.stop_loss}\``,   inline: true });
  if (r.risk_reward)         fields.push({ name: "R:R",         value: String(r.risk_reward),  inline: true });
  if (r.confidence)          fields.push({ name: "Confidence",  value: String(r.confidence).toUpperCase(), inline: true });

  // ── Generic: any remaining fields not in the trade set ───────────────────
  for (const [key, val] of Object.entries(r)) {
    if (TRADE_FIELDS.has(key)) continue;
    if (val === null || val === undefined) continue;
    const rendered = renderValue(val);
    if (!rendered) continue;
    // Inline only for short scalar values
    const isShort = typeof val !== "object" && !Array.isArray(val) && rendered.length <= 30;
    fields.push({ name: toLabel(key), value: rendered.slice(0, 1024), inline: isShort });
  }

  // ── Body lines for narrative fields ───────────────────────────────────────
  const bodyLines: string[] = [];
  if (r.technical_summary) bodyLines.push(`**Technical** · ${r.technical_summary}`);
  if (r.news_summary)      bodyLines.push(`**News** · ${r.news_summary}`);
  if (r.consensus)         bodyLines.push(`**Consensus** · ${r.consensus}`);
  if (r.conflict)          bodyLines.push(`**Conflict** · ${r.conflict}`);
  if (r.invalidation)      bodyLines.push(`**Invalidation** · ${r.invalidation}`);
  if (Array.isArray(r.watch_for)) bodyLines.push(`**Watch for**\n${(r.watch_for as string[]).map((w) => `• ${w}`).join("\n")}`);

  return {
    embeds: [{
      title: titleParts.join(" · "),
      description: bodyLines.join("\n\n") || undefined,
      color: decisionColor(r),
      fields: fields.length ? fields.slice(0, 25) : undefined,
      footer: { text: `muxai · ${payload.agentName}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

/** "assigned_to" → "Assigned To", "action_items" → "Action Items" */
function toLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatError(payload: NotificationPayload): object {
  return {
    embeds: [{
      title: `❌ ${payload.agentName} — Run Failed`,
      description: payload.errorMsg ?? `Process exited with code ${payload.exitCode ?? "?"}`,
      color: COLORS.error,
      footer: { text: `muxai · run ${payload.runId.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

function formatRunEnd(payload: NotificationPayload): object {
  return {
    embeds: [{
      title: `✓ ${payload.agentName} — Run Completed`,
      color: COLORS.run_end,
      footer: { text: `muxai · run ${payload.runId.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

export async function send(webhookUrl: string, payload: NotificationPayload): Promise<void> {
  let body: object;
  if (payload.event === "decision") body = formatDecision(payload);
  else if (payload.event === "error") body = formatError(payload);
  else body = formatRunEnd(payload);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
}
