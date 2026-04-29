import { prisma } from "../../lib/db";
import { runChatTurn } from "../chat-runner";
import { reportTick, removeEntry } from "../scheduler-registry";

const CONTROL_TOWER_ROLE = "control_tower";
const TELEGRAM_API = "https://api.telegram.org";
const POLL_TIMEOUT_S = 30;
const BACKOFF_MS = 5000;

const telegramId = (agentId: string) => `telegram:${agentId}`;

export interface TelegramGatewayConfig {
  token: string;
  botUsername?: string;
  ownerChatId?: number;
  ownerUsername?: string;
  pairingStartedAt?: string;
  connectedAt?: string;
}

interface PollerState {
  token: string;
  agentId: string;
  offset: number;
  running: boolean;
  abortController: AbortController;
  msgsHandled: number;
  ownerUsername?: string;
}

let activePoller: PollerState | null = null;

export async function telegramGetMe(
  token: string,
): Promise<{ ok: true; username: string; id: number; firstName: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username: string; id: number; first_name: string }; description?: string };
    if (!body.ok || !body.result) return { ok: false, error: body.description || "Telegram rejected token" };
    return { ok: true, username: body.result.username, id: body.result.id, firstName: body.result.first_name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

async function tgPost(token: string, method: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err instanceof Error ? err.message : err);
  }
}

export function telegramSendMessage(token: string, chatId: number, text: string): Promise<void> {
  // Telegram caps messages at 4096 chars. Truncate with a note.
  const MAX = 4000;
  const payload = text.length > MAX ? text.slice(0, MAX) + "\n\n…(truncated)" : text;
  return tgPost(token, "sendMessage", { chat_id: chatId, text: payload });
}

export function telegramSendChatAction(token: string, chatId: number, action = "typing"): Promise<void> {
  return tgPost(token, "sendChatAction", { chat_id: chatId, action });
}

export function isPollerActive(): boolean {
  return activePoller !== null;
}

export async function stopPoller(): Promise<void> {
  if (!activePoller) return;
  activePoller.running = false;
  try { activePoller.abortController.abort(); } catch { /* ignore */ }
  removeEntry(telegramId(activePoller.agentId));
  activePoller = null;
}

export async function startPoller(agentId: string, token: string): Promise<void> {
  await stopPoller();
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, adapterConfig: true } });
  const config = (agent?.adapterConfig ?? {}) as Record<string, unknown>;
  const gateways = (config.gateways ?? {}) as Record<string, unknown>;
  const telegram = (gateways.telegram ?? {}) as TelegramGatewayConfig;
  const state: PollerState = {
    token,
    agentId,
    offset: 0,
    running: true,
    abortController: new AbortController(),
    msgsHandled: 0,
    ownerUsername: telegram.ownerUsername,
  };
  activePoller = state;
  reportTick(telegramId(agentId), {
    kind: "telegram",
    label: `Telegram — ${agent?.name ?? "Control Tower"}`,
    schedule: "polling",
    status: "idle",
    meta: {
      ownerUsername: telegram.ownerUsername,
      paired: Boolean(telegram.ownerChatId),
      msgsHandled: 0,
    },
  });
  pollLoop(state).catch((err) => {
    console.error("[telegram] poll loop crashed:", err);
    reportTick(telegramId(agentId), { status: "error", lastError: err instanceof Error ? err.message : String(err) });
  });
}

async function pollLoop(state: PollerState): Promise<void> {
  while (state.running) {
    try {
      const url = `${TELEGRAM_API}/bot${state.token}/getUpdates?offset=${state.offset}&timeout=${POLL_TIMEOUT_S}`;
      const res = await fetch(url, { signal: state.abortController.signal });
      reportTick(telegramId(state.agentId), { status: "idle", lastTickAt: new Date(), lastError: undefined });
      if (!res.ok) {
        if (res.status === 401) {
          console.error("[telegram] token unauthorized, stopping poller");
          reportTick(telegramId(state.agentId), { status: "error", lastError: "token unauthorized" });
          await stopPoller();
          return;
        }
        reportTick(telegramId(state.agentId), { status: "error", lastError: `HTTP ${res.status}` });
        await sleep(BACKOFF_MS);
        continue;
      }
      const body = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
      if (!body.ok || !body.result) {
        await sleep(BACKOFF_MS);
        continue;
      }
      for (const update of body.result) {
        state.offset = update.update_id + 1;
        try {
          reportTick(telegramId(state.agentId), { status: "running" });
          await handleUpdate(state, update);
          state.msgsHandled++;
          reportTick(telegramId(state.agentId), {
            status: "idle",
            meta: { ownerUsername: state.ownerUsername, paired: true, msgsHandled: state.msgsHandled },
          });
        } catch (err) {
          console.error("[telegram] handleUpdate:", err);
          reportTick(telegramId(state.agentId), { status: "error", lastError: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[telegram] poll error:", err instanceof Error ? err.message : err);
      reportTick(telegramId(state.agentId), { status: "error", lastError: err instanceof Error ? err.message : String(err) });
      await sleep(BACKOFF_MS);
    }
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { username?: string; first_name?: string };
    text?: string;
  };
}

async function handleUpdate(state: PollerState, update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from?.username || msg.from?.first_name || `user_${chatId}`;

  const agent = await prisma.agent.findUnique({ where: { id: state.agentId } });
  if (!agent) return;
  const config = agent.adapterConfig as Record<string, unknown>;
  const gateways = (config.gateways ?? {}) as Record<string, unknown>;
  const telegram = (gateways.telegram ?? {}) as TelegramGatewayConfig;

  const isOwner = telegram.ownerChatId === chatId;
  const awaitingPair = !telegram.ownerChatId;
  const trimmed = text.trim();

  // /start handling
  if (trimmed === "/start") {
    if (awaitingPair) {
      const updatedTelegram: TelegramGatewayConfig = {
        ...telegram,
        ownerChatId: chatId,
        ownerUsername: username,
        connectedAt: new Date().toISOString(),
      };
      delete updatedTelegram.pairingStartedAt;
      await prisma.agent.update({
        where: { id: state.agentId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { adapterConfig: { ...config, gateways: { ...gateways, telegram: updatedTelegram } } as any },
      });
      await telegramSendMessage(
        state.token,
        chatId,
        "muxAI Control Tower — connected.\n\nYou're the operator. I can list agents, invoke runs, and report back.\n\nCommands:\n/reset — start a fresh conversation\n/whoami — show your chat id",
      );
      return;
    }
    if (isOwner) {
      await telegramSendMessage(state.token, chatId, "Already connected. How can I help?");
      return;
    }
    await telegramSendMessage(state.token, chatId, "This bot is already paired with another operator.");
    return;
  }

  if (!isOwner) {
    await telegramSendMessage(
      state.token,
      chatId,
      awaitingPair ? "Send /start to connect this bot." : "Unauthorized.",
    );
    return;
  }

  if (trimmed === "/whoami") {
    await telegramSendMessage(state.token, chatId, `Chat ID: ${chatId}\nUsername: @${username}`);
    return;
  }

  if (trimmed === "/reset") {
    const session = await prisma.chatSession.findFirst({ where: { agentId: state.agentId } });
    if (session) {
      await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
      await prisma.chatSession.update({ where: { id: session.id }, data: { claudeSessionId: null, lastResetAt: new Date() } });
    }
    await telegramSendMessage(state.token, chatId, "Conversation reset. I've forgotten prior context.");
    return;
  }

  // Normal relay — run through the same ChatSession the web /chat uses.
  let session = await prisma.chatSession.findFirst({ where: { agentId: state.agentId } });
  if (!session) session = await prisma.chatSession.create({ data: { agentId: state.agentId } });

  telegramSendChatAction(state.token, chatId).catch(() => { /* ignore */ });
  const typingTimer = setInterval(() => {
    telegramSendChatAction(state.token, chatId).catch(() => { /* ignore */ });
  }, 4000);

  let streamedAnything = false;
  try {
    const response = await runChatTurn({
      chatSessionId: session.id,
      prompt: text,
      agentId: state.agentId,
      onText: (chunk) => {
        streamedAnything = true;
        telegramSendMessage(state.token, chatId, chunk).catch(() => { /* ignore */ });
      },
    });
    if (!streamedAnything && response) {
      await telegramSendMessage(state.token, chatId, response);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Something went wrong";
    console.error("[telegram] relay error:", errMsg);
    // If nothing reached the user yet, surface the error; otherwise stay quiet
    // so a stray "timed out" doesn't contradict the preamble the user already saw.
    if (!streamedAnything) {
      await telegramSendMessage(state.token, chatId, `Error: ${errMsg}`);
    }
  } finally {
    clearInterval(typingTimer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function initTelegramGatewayOnBoot(): Promise<void> {
  try {
    const agent = await prisma.agent.findFirst({ where: { role: CONTROL_TOWER_ROLE } });
    if (!agent) return;
    const config = agent.adapterConfig as Record<string, unknown>;
    const gateways = (config.gateways ?? {}) as Record<string, unknown>;
    const telegram = gateways.telegram as TelegramGatewayConfig | undefined;
    if (!telegram?.token) return;
    await startPoller(agent.id, telegram.token);
    const who = telegram.ownerUsername ? `owner @${telegram.ownerUsername}` : "pending pair";
    console.log(`[telegram] gateway poller started (${who})`);
  } catch (err) {
    console.error("[telegram] boot init failed:", err instanceof Error ? err.message : err);
  }
}
