import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/db";
import { generateWallet, generateEvmWallet } from "../services/wallet";
import { syncAgentSchedule } from "../services/scheduler";
import { MUXAI_ROOT } from "../services/claude-spawn";
import { DEFAULT_MODEL } from "../services/models";
import {
  telegramGetMe,
  startPoller as startTelegramPoller,
  stopPoller as stopTelegramPoller,
  isPollerActive as isTelegramPollerActive,
  type TelegramGatewayConfig,
} from "../services/gateways/telegram";

export const controlTowerRoutes = Router();

const CONTROL_TOWER_ROLE = "control_tower";

type GatewayState = "disconnected" | "pairing" | "connected";

interface TelegramStatus {
  state: GatewayState;
  botUsername?: string;
  ownerUsername?: string;
  ownerChatId?: number;
  connectedAt?: string;
  polling: boolean;
}

function readTelegramConfig(adapterConfig: Record<string, unknown>): TelegramGatewayConfig | null {
  const gateways = (adapterConfig.gateways ?? {}) as Record<string, unknown>;
  const telegram = gateways.telegram as TelegramGatewayConfig | undefined;
  return telegram?.token ? telegram : null;
}

function buildTelegramStatus(tg: TelegramGatewayConfig | null): TelegramStatus {
  if (!tg) return { state: "disconnected", polling: false };
  const state: GatewayState = tg.ownerChatId ? "connected" : "pairing";
  return {
    state,
    botUsername: tg.botUsername,
    ownerUsername: tg.ownerUsername,
    ownerChatId: tg.ownerChatId,
    connectedAt: tg.connectedAt,
    polling: isTelegramPollerActive(),
  };
}

async function getControlTowerOrNull() {
  return prisma.agent.findFirst({ where: { role: CONTROL_TOWER_ROLE } });
}

async function writeTelegramConfig(agentId: string, adapterConfig: Record<string, unknown>, next: TelegramGatewayConfig | null) {
  const gateways = { ...((adapterConfig.gateways ?? {}) as Record<string, unknown>) };
  if (next) gateways.telegram = next;
  else delete gateways.telegram;
  await prisma.agent.update({
    where: { id: agentId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { adapterConfig: { ...adapterConfig, gateways } as any },
  });
}

function loadSkill(): string {
  const skillPath = path.join(MUXAI_ROOT, "apps/web/src/lib/agent-templates/control-tower/SKILL.md");
  try {
    return fs.readFileSync(skillPath, "utf-8");
  } catch {
    return "";
  }
}

// GET /api/control-tower — returns the singleton agent or null
controlTowerRoutes.get("/", async (_req, res) => {
  const agent = await prisma.agent.findFirst({
    where: { role: CONTROL_TOWER_ROLE },
  });
  if (!agent) {
    res.json({ agent: null, messageCount: 0 });
    return;
  }
  const session = await prisma.chatSession.findFirst({ where: { agentId: agent.id } });
  const messageCount = session
    ? await prisma.chatMessage.count({ where: { sessionId: session.id } })
    : 0;
  res.json({ agent, messageCount });
});

// POST /api/control-tower — creates the singleton if it doesn't already exist
controlTowerRoutes.post("/", async (_req, res) => {
  const existing = await prisma.agent.findFirst({ where: { role: CONTROL_TOWER_ROLE } });
  if (existing) {
    res.status(409).json({ error: "Control Tower already exists", agent: existing });
    return;
  }

  const promptTemplate = loadSkill();
  const [wallet, evmWallet] = await Promise.all([generateWallet(), generateEvmWallet()]);

  const agent = await prisma.agent.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: {
      name: "Control Tower",
      role: CONTROL_TOWER_ROLE,
      title: "Admin Agent",
      capabilities: "Invoke agents, query runs and decisions, administer the muxAI deployment.",
      adapterType: "claude_local",
      adapterConfig: {
        model: DEFAULT_MODEL,
        cwd: MUXAI_ROOT,
        disallowedTools: "Read,Write,Edit,Bash,Grep,Glob,Agent",
        maxTurnsPerRun: 30,
        promptTemplate,
        memoryEnabled: true,
        persistLogs: true,
      },
      runtimeConfig: {},
      walletAddress: wallet.address,
      walletKey: wallet.keyBytes,
      walletAddressEvm: evmWallet.address,
      walletKeyEvm: evmWallet.keyHex,
    } as any,
  });

  syncAgentSchedule(agent.id, agent.runtimeConfig);
  res.status(201).json({ agent });
});

// --- Telegram gateway ---

// POST /api/control-tower/gateways/telegram/validate — check a token without saving
controlTowerRoutes.post("/gateways/telegram/validate", async (req, res) => {
  const { token } = (req.body ?? {}) as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }
  const info = await telegramGetMe(token.trim());
  if (!info.ok) {
    res.status(400).json({ error: info.error });
    return;
  }
  res.json({ ok: true, botUsername: info.username, botId: info.id, firstName: info.firstName });
});

// GET /api/control-tower/gateways/telegram — current status
controlTowerRoutes.get("/gateways/telegram", async (_req, res) => {
  const agent = await getControlTowerOrNull();
  if (!agent) {
    res.status(404).json({ error: "Control Tower not set up yet" });
    return;
  }
  const config = agent.adapterConfig as Record<string, unknown>;
  const tg = readTelegramConfig(config);
  res.json(buildTelegramStatus(tg));
});

// POST /api/control-tower/gateways/telegram — connect (save token, validate, start poller in pairing mode)
controlTowerRoutes.post("/gateways/telegram", async (req, res) => {
  const { token } = (req.body ?? {}) as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }
  const agent = await getControlTowerOrNull();
  if (!agent) {
    res.status(404).json({ error: "Control Tower not set up yet" });
    return;
  }

  const info = await telegramGetMe(token.trim());
  if (!info.ok) {
    res.status(400).json({ error: info.error });
    return;
  }

  const config = agent.adapterConfig as Record<string, unknown>;
  const next: TelegramGatewayConfig = {
    token: token.trim(),
    botUsername: info.username,
    pairingStartedAt: new Date().toISOString(),
  };
  await writeTelegramConfig(agent.id, config, next);
  await startTelegramPoller(agent.id, next.token);

  res.status(201).json(buildTelegramStatus(next));
});

// DELETE /api/control-tower/gateways/telegram — stop poller + clear config
controlTowerRoutes.delete("/gateways/telegram", async (_req, res) => {
  const agent = await getControlTowerOrNull();
  if (!agent) {
    res.status(404).json({ error: "Control Tower not set up yet" });
    return;
  }
  await stopTelegramPoller();
  const config = agent.adapterConfig as Record<string, unknown>;
  await writeTelegramConfig(agent.id, config, null);
  res.status(204).end();
});
