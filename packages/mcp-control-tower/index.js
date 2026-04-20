#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "control-tower", version: "1.0.0" }, { capabilities: { tools: {} } });

function getApiUrl() {
  return process.env.MUXAI_API_URL || "http://localhost:3001";
}

function internalHeaders() {
  const secret = process.env.MUXAI_INTERNAL_SECRET;
  return secret ? { "x-muxai-internal": secret } : {};
}

function log(msg) {
  process.stderr.write(`[control-tower] ${msg}\n`);
}

async function listAgents() {
  const res = await fetch(`${getApiUrl()}/api/agents`, { headers: internalHeaders() });
  if (!res.ok) throw new Error(`Failed to list agents: ${res.status}`);
  return res.json();
}

async function invokeAgent(agentId, task) {
  const res = await fetch(`${getApiUrl()}/api/agents/${agentId}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    body: JSON.stringify(task ? { task } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to invoke agent ${agentId}: ${res.status} — ${err}`);
  }
  return res.json();
}

async function getRun(runId) {
  const res = await fetch(`${getApiUrl()}/api/runs/${runId}`, { headers: internalHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch run ${runId}: ${res.status}`);
  return res.json();
}

async function fetchAgentDecisions(agentId, limit) {
  const url = new URL(`${getApiUrl()}/api/agents/decisions`);
  url.searchParams.set("agentId", agentId);
  if (limit) url.searchParams.set("limit", String(limit));
  const res = await fetch(url, { headers: internalHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch decisions: ${res.status}`);
  return res.json();
}

async function postAgentStop(agentId) {
  const res = await fetch(`${getApiUrl()}/api/agents/${agentId}/stop`, {
    method: "POST",
    headers: internalHeaders(),
  });
  if (res.status === 404) return { stopped: false, reason: "no active run" };
  if (!res.ok) throw new Error(`Failed to stop ${agentId}: ${res.status}`);
  return res.json();
}

async function patchAgentStatus(agentId, status) {
  const res = await fetch(`${getApiUrl()}/api/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to set status on ${agentId}: ${res.status} — ${err}`);
  }
  return res.json();
}

async function postAgentMemoryReset(agentId) {
  const res = await fetch(`${getApiUrl()}/api/agents/${agentId}/memory/reset`, {
    method: "POST",
    headers: internalHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to reset memory on ${agentId}: ${res.status}`);
  return true;
}

async function pollRun(runId, agentName, intervalMs = 4000, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run.status !== "running" && run.status !== "queued") {
      log(`${agentName} finished — status: ${run.status}`);
      return run;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Run ${runId} timed out after ${timeoutMs / 1000}s`);
}

function findAgent(agents, query) {
  const normalize = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, "");
  const q = normalize(query);
  return (
    agents.find((a) => a.id === query) ||
    agents.find((a) => normalize(a.name) === q) ||
    agents.find((a) => normalize(a.role) === q)
  );
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_agents",
      description:
        "List every agent in this muxAI deployment (excluding the Control Tower itself). " +
        "Returns id, name, role, title, status, total runs, and whether the agent has a schedule. " +
        "Use this to see who you can invoke or inspect.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "invoke_agent",
      description:
        "Invoke a specific agent by name, role, or id and wait for the run to complete. " +
        "Pass an optional task to override the agent's default prompt for this run. " +
        "Returns the final status and any result card / logs.",
      inputSchema: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            description: "Name, role, or id of the agent to invoke. Use list_agents first if unsure.",
          },
          task: {
            type: "string",
            description: "Optional task or instructions for this run. Omit to use the agent's default prompt.",
          },
        },
        required: ["agent"],
      },
    },
    {
      name: "get_run_status",
      description:
        "Fetch the status, result, and logs of a single run by id. " +
        "Use this when you want to inspect an older run or an in-flight run you didn't start.",
      inputSchema: {
        type: "object",
        properties: {
          runId: { type: "string", description: "The run id to look up." },
        },
        required: ["runId"],
      },
    },
    {
      name: "get_agent_decisions",
      description:
        "Fetch an agent's recent decisions (the structured result cards from past runs) along with any user-marked outcome. " +
        "Use this when the user asks what a specific agent decided recently, or how a trading agent has been performing.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Name, role, or id of the agent." },
          limit: { type: "number", description: "How many recent decisions to return (default 5, max 20)." },
        },
        required: ["agent"],
      },
    },
    {
      name: "stop_agent",
      description:
        "Kill the active run for an agent. Use when a run is stuck or when the user asks you to stop something that's running. " +
        "No-op if the agent has no active run.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Name, role, or id of the agent to stop." },
        },
        required: ["agent"],
      },
    },
    {
      name: "pause_agent",
      description:
        "Pause an agent so the scheduler skips it until it is resumed. Does not stop an in-flight run. " +
        "Use when the user wants to temporarily silence a scheduled agent without deleting it.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Name, role, or id of the agent to pause." },
        },
        required: ["agent"],
      },
    },
    {
      name: "resume_agent",
      description:
        "Resume a paused (or errored) agent back to idle so it can run again on its schedule or on demand.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Name, role, or id of the agent to resume." },
        },
        required: ["agent"],
      },
    },
    {
      name: "reset_agent_memory",
      description:
        "Clear the shared Claude session for an agent with Active Memory enabled. Next run starts fresh. " +
        "Use when an agent's context has drifted or the user explicitly asks to wipe its memory.",
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", description: "Name, role, or id of the agent." },
        },
        required: ["agent"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_agents") {
    const agents = await listAgents();
    if (agents.length === 0) {
      return { content: [{ type: "text", text: "No agents exist yet. Create one from the muxAI dashboard to get started." }] };
    }
    const lines = agents.map((a) => {
      const heartbeat = a.runtimeConfig?.heartbeat;
      const schedule = heartbeat?.enabled ? `scheduled (${heartbeat.cron})` : "manual";
      return `- **${a.name}** (${a.role}) · status: ${a.status} · runs: ${a._count?.runs ?? 0} · ${schedule} · id: \`${a.id}\``;
    });
    return { content: [{ type: "text", text: `## Agents (${agents.length})\n\n${lines.join("\n")}` }] };
  }

  if (name === "invoke_agent") {
    const query = args?.agent;
    const task = args?.task;
    if (!query) {
      return { content: [{ type: "text", text: "agent parameter is required." }] };
    }
    const agents = await listAgents();
    const target = findAgent(agents, query);
    if (!target) {
      const available = agents.map((a) => `${a.name} (${a.role})`).join(", ");
      return { content: [{ type: "text", text: `Agent "${query}" not found. Available: ${available || "none"}` }] };
    }
    log(`Invoking ${target.name} (${target.id})${task ? ` with task: "${task}"` : ""}`);
    const run = await invokeAgent(target.id, task);
    const finished = await pollRun(run.id, target.name);
    const result = finished.resultJson ? `\n\n\`\`\`json\n${JSON.stringify(finished.resultJson, null, 2)}\n\`\`\`` : "";
    const logs = finished.logs ? `\n\n${finished.logs}` : "";
    return {
      content: [
        {
          type: "text",
          text: `## ${target.name} (${target.role})\nStatus: ${finished.status}\nRun: ${finished.id}${result}${logs}`,
        },
      ],
    };
  }

  if (name === "get_run_status") {
    const runId = args?.runId;
    if (!runId) {
      return { content: [{ type: "text", text: "runId parameter is required." }] };
    }
    try {
      const run = await getRun(runId);
      const agentLine = run.agent ? `Agent: ${run.agent.name} (${run.agent.role})\n` : "";
      const result = run.resultJson ? `\n\n\`\`\`json\n${JSON.stringify(run.resultJson, null, 2)}\n\`\`\`` : "";
      const logs = run.logs ? `\n\n${run.logs}` : "";
      return {
        content: [
          {
            type: "text",
            text: `## Run ${run.id}\n${agentLine}Status: ${run.status}\nStarted: ${run.startedAt ?? "—"}\nFinished: ${run.finishedAt ?? "—"}${result}${logs}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error fetching run: ${err.message}` }] };
    }
  }

  async function resolveAgent(query) {
    if (!query) return null;
    const agents = await listAgents();
    return findAgent(agents, query);
  }

  if (name === "get_agent_decisions") {
    const target = await resolveAgent(args?.agent);
    if (!target) return { content: [{ type: "text", text: `Agent "${args?.agent}" not found.` }] };
    const data = await fetchAgentDecisions(target.id, args?.limit);
    if (data.count === 0) {
      return { content: [{ type: "text", text: `## ${target.name}\nNo recorded decisions yet.` }] };
    }
    const lines = data.decisions.map((d, i) => {
      const when = d.finishedAt ? new Date(d.finishedAt).toISOString() : "—";
      const outcome = d.outcome ? ` · outcome: **${d.outcome}**` : "";
      const json = JSON.stringify(d.decision, null, 2);
      return `### ${i + 1}. ${when}${outcome}\n\`\`\`json\n${json}\n\`\`\``;
    });
    return { content: [{ type: "text", text: `## ${target.name} — last ${data.count} decisions\n\n${lines.join("\n\n")}` }] };
  }

  if (name === "stop_agent") {
    const target = await resolveAgent(args?.agent);
    if (!target) return { content: [{ type: "text", text: `Agent "${args?.agent}" not found.` }] };
    const result = await postAgentStop(target.id);
    if (result.stopped === false && result.reason === "no active run") {
      return { content: [{ type: "text", text: `${target.name} has no active run to stop.` }] };
    }
    const alive = result.wasAlive ? "process killed" : "process was not alive, run marked cancelled";
    return { content: [{ type: "text", text: `Stopped ${target.name} (run ${result.runId}) — ${alive}.` }] };
  }

  if (name === "pause_agent") {
    const target = await resolveAgent(args?.agent);
    if (!target) return { content: [{ type: "text", text: `Agent "${args?.agent}" not found.` }] };
    if (target.status === "paused") {
      return { content: [{ type: "text", text: `${target.name} is already paused.` }] };
    }
    await patchAgentStatus(target.id, "paused");
    return { content: [{ type: "text", text: `Paused ${target.name}. Scheduler will skip it until resumed.` }] };
  }

  if (name === "resume_agent") {
    const target = await resolveAgent(args?.agent);
    if (!target) return { content: [{ type: "text", text: `Agent "${args?.agent}" not found.` }] };
    if (target.status === "idle") {
      return { content: [{ type: "text", text: `${target.name} is already idle.` }] };
    }
    if (target.status === "running") {
      return { content: [{ type: "text", text: `${target.name} is currently running — nothing to resume.` }] };
    }
    await patchAgentStatus(target.id, "idle");
    return { content: [{ type: "text", text: `Resumed ${target.name}. It will run on its next schedule or invocation.` }] };
  }

  if (name === "reset_agent_memory") {
    const target = await resolveAgent(args?.agent);
    if (!target) return { content: [{ type: "text", text: `Agent "${args?.agent}" not found.` }] };
    await postAgentMemoryReset(target.id);
    return { content: [{ type: "text", text: `Cleared shared memory on ${target.name}. Its next run starts with a fresh Claude session.` }] };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
