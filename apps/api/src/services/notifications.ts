import * as discord from "./notification-channels/discord";

export type NotificationEvent = "decision" | "error" | "run_end";

// Global channel — stored in Setting table as JSON array under key "notification_channels"
export interface NotificationChannel {
  id: string;
  name: string;
  channel: string;   // "discord" | "slack" | ...
  webhookUrl: string;
  enabled: boolean;
}

export interface NotificationPayload {
  event: NotificationEvent;
  agentName: string;
  agentId: string;
  runId: string;
  resultJson?: Record<string, unknown>;
  errorMsg?: string;
  exitCode?: number;
}

// ─── Channel registry — add new channels here ────────────────────────────────

const CHANNELS: Record<string, (url: string, payload: NotificationPayload) => Promise<void>> = {
  discord: discord.send,
  // slack:    slack.send,
  // telegram: telegram.send,
};

// ─── Dispatcher ───────────────────────────────────────────────────────────────
// channels  — global enabled channels from Settings
// notifyOn  — events this agent has opted into
// payload   — event details

export async function dispatchNotifications(
  channels: NotificationChannel[],
  notifyOn: NotificationEvent[],
  payload: NotificationPayload,
): Promise<void> {
  if (!notifyOn.includes(payload.event)) return;
  const targets = channels.filter((c) => c.enabled && c.webhookUrl);
  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map((c) => {
      const send = CHANNELS[c.channel];
      if (!send) {
        console.warn(`[notifications] Unknown channel: ${c.channel}`);
        return Promise.resolve();
      }
      return send(c.webhookUrl, payload).catch((err) => {
        console.error(`[notifications] ${c.channel} dispatch failed:`, err.message);
      });
    })
  );
}
