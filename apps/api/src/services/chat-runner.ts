import { spawn } from "child_process";
import { prisma } from "../lib/db";
import { CLAUDE_CLI, MUXAI_ROOT, buildMcpConfig } from "./claude-spawn";
import { DEFAULT_MODEL } from "./models";
import { parseStreamJson, extractAssistantText } from "./stream-parser";
import { INTERNAL_SECRET } from "./internal-secret";

interface RunChatTurnOpts {
  chatSessionId: string;
  prompt: string;
  agentId?: string | null;
  useMcp?: boolean;
  maxMs?: number;
  onText?: (chunk: string) => void;
}

export async function runChatTurn(opts: RunChatTurnOpts): Promise<string> {
  const { chatSessionId, prompt, agentId, useMcp = false, maxMs = 900_000, onText } = opts;

  const session = await prisma.chatSession.findUnique({ where: { id: chatSessionId } });
  if (!session) throw new Error("Session not found");

  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: prompt },
  });

  let args: string[];
  let cwd = MUXAI_ROOT;

  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error("Agent not found");
    const config = agent.adapterConfig as Record<string, unknown>;
    const model = (config.model as string) || DEFAULT_MODEL;
    const systemPrompt = config.promptTemplate as string | undefined;
    cwd = (config.cwd as string) || MUXAI_ROOT;
    const isBuiltin = cwd === MUXAI_ROOT;
    const maxTurns = (config.maxTurnsPerRun as number) || 20;
    const disallowedTools = config.disallowedTools as string | undefined;

    args = [
      "--model", model,
      "--max-turns", String(maxTurns),
      "--dangerously-skip-permissions",
      "--output-format", "stream-json",
      "--verbose",
      "--print", prompt,
    ];
    if (session.claudeSessionId) args.splice(0, 0, "--resume", session.claudeSessionId);
    if (systemPrompt?.trim()) args.splice(args.indexOf("--output-format"), 0, "--system-prompt", systemPrompt);
    if (disallowedTools) args.splice(args.indexOf("--output-format"), 0, "--disallowedTools", disallowedTools);
    if (isBuiltin) {
      try {
        const mcpConfig = await buildMcpConfig();
        args.splice(args.indexOf("--output-format"), 0, "--mcp-config", mcpConfig, "--strict-mcp-config");
      } catch {
        // proceed without MCP
      }
    }
  } else {
    args = [
      "--model", DEFAULT_MODEL,
      "--max-turns", "20",
      "--dangerously-skip-permissions",
      "--output-format", "stream-json",
      "--verbose",
      "--print", prompt,
    ];
    if (session.claudeSessionId) args.splice(0, 0, "--resume", session.claudeSessionId);
    if (useMcp) {
      try {
        const mcpConfig = await buildMcpConfig();
        args.splice(args.indexOf("--output-format"), 0, "--mcp-config", mcpConfig, "--strict-mcp-config");
      } catch {
        // proceed without MCP
      }
    }
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    MUXAI_API_URL: `http://localhost:${process.env.API_PORT || 3001}`,
    MUXAI_INTERNAL_SECRET: INTERNAL_SECRET,
    ...(agentId ? { MUXAI_AGENT_ID: agentId } : {}),
  };

  return new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_CLI, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });

    const chunks: string[] = [];
    let stdoutBuffer = "";
    let claudeSessionId: string | null = null;

    child.stdout!.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const { text, sessionId: sid } = parseStreamJson(line);
        if (sid) claudeSessionId = sid;
        if (text) chunks.push(text);
        // Emit pure-text chunks (no tool-use hints) for streaming consumers.
        if (onText) {
          const textOnly = extractAssistantText(line);
          if (textOnly) onText(textOnly);
        }
      }
    });

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
      reject(new Error("Chat turn timed out"));
    }, maxMs);

    child.on("close", async (code) => {
      clearTimeout(timer);
      const response = chunks.join("\n").trim();
      try {
        if (claudeSessionId) {
          await prisma.chatSession.update({ where: { id: session.id }, data: { claudeSessionId } });
        }
        if (response) {
          await prisma.chatMessage.create({
            data: { sessionId: session.id, role: "assistant", content: response },
          });
        }
      } catch (err) {
        console.error("[chat-runner] DB write failed:", err);
      }
      if (code === 0 && response) resolve(response);
      else reject(new Error(`Chat turn failed with code ${code ?? "?"}`));
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
