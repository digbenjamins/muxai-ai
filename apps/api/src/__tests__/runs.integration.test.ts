import { Prisma } from "@prisma/client";
import { describe, it, expect } from "vitest";
import { setupTestDb, getTestPrisma } from "./setup-db";

setupTestDb();

describe("runs integration", () => {
  it("creates a run linked to an agent", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({
      data: { name: "Run Agent", role: "analyst" },
    });

    const run = await prisma.heartbeatRun.create({
      data: {
        agentId: agent.id,
        status: "running",
        invocationSource: "on_demand",
        startedAt: new Date(),
      },
    });

    expect(run.agentId).toBe(agent.id);
    expect(run.status).toBe("running");
    expect(run.invocationSource).toBe("on_demand");
  });

  it("stores and retrieves resultJson", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({
      data: { name: "Result Agent" },
    });

    const tradeDecision = {
      decision: "LONG",
      asset: "BTC/USDT",
      timeframe: "4h",
      entry: 71400,
      take_profit: 74200,
      stop_loss: 69900,
      risk_reward: "1:1.87",
      confidence: "medium",
    };

    const run = await prisma.heartbeatRun.create({
      data: {
        agentId: agent.id,
        status: "succeeded",
        resultJson: tradeDecision,
        startedAt: new Date(),
        finishedAt: new Date(),
        exitCode: 0,
      },
    });

    const fetched = await prisma.heartbeatRun.findUnique({ where: { id: run.id } });
    const result = fetched!.resultJson as Record<string, unknown>;
    expect(result.decision).toBe("LONG");
    expect(result.entry).toBe(71400);
    expect(result.stop_loss).toBe(69900);
  });

  it("retrieves run with agent details including adapterConfig", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({
      data: {
        name: "Config Agent",
        adapterConfig: { resultCard: { type: "trade", mapping: { decision: "decision" } } },
      },
    });

    const run = await prisma.heartbeatRun.create({
      data: { agentId: agent.id, status: "succeeded", resultJson: { decision: "LONG" } },
    });

    const fetched = await prisma.heartbeatRun.findUnique({
      where: { id: run.id },
      include: { agent: { select: { id: true, name: true, role: true, adapterConfig: true } } },
    });

    expect(fetched!.agent.name).toBe("Config Agent");
    const config = fetched!.agent.adapterConfig as Record<string, unknown>;
    expect(config.resultCard).toBeDefined();
  });

  it("filters runs by status", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({ data: { name: "Filter Agent" } });

    await prisma.heartbeatRun.createMany({
      data: [
        { agentId: agent.id, status: "succeeded" },
        { agentId: agent.id, status: "succeeded" },
        { agentId: agent.id, status: "failed" },
      ],
    });

    const succeeded = await prisma.heartbeatRun.findMany({ where: { status: "succeeded" } });
    const failed = await prisma.heartbeatRun.findMany({ where: { status: "failed" } });

    expect(succeeded).toHaveLength(2);
    expect(failed).toHaveLength(1);
  });

  it("updates run status from running to succeeded", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({ data: { name: "Update Agent" } });

    const run = await prisma.heartbeatRun.create({
      data: { agentId: agent.id, status: "running", startedAt: new Date() },
    });

    const updated = await prisma.heartbeatRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date(), exitCode: 0 },
    });

    expect(updated.status).toBe("succeeded");
    expect(updated.exitCode).toBe(0);
    expect(updated.finishedAt).toBeDefined();
  });

  it("stores and retrieves outcome fields", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({ data: { name: "Outcome Agent" } });

    const outcomeAt = new Date();
    const run = await prisma.heartbeatRun.create({
      data: {
        agentId: agent.id,
        status: "succeeded",
        resultJson: { decision: "LONG", asset: "BTC/USDT" },
        outcome: "Win",
        outcomeFields: { pnl: 420.5, note: "hit TP1" },
        outcomeAt,
      },
    });

    const fetched = await prisma.heartbeatRun.findUnique({ where: { id: run.id } });
    expect(fetched!.outcome).toBe("Win");
    expect(fetched!.outcomeAt?.toISOString()).toBe(outcomeAt.toISOString());
    const fields = fetched!.outcomeFields as Record<string, unknown>;
    expect(fields.pnl).toBe(420.5);
    expect(fields.note).toBe("hit TP1");
  });

  it("allows clearing an outcome back to null", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({ data: { name: "Clear Outcome Agent" } });

    const run = await prisma.heartbeatRun.create({
      data: {
        agentId: agent.id,
        status: "succeeded",
        outcome: "Loss",
        outcomeFields: { pnl: -100 },
        outcomeAt: new Date(),
      },
    });

    const cleared = await prisma.heartbeatRun.update({
      where: { id: run.id },
      data: { outcome: null, outcomeFields: Prisma.DbNull, outcomeAt: null },
    });

    expect(cleared.outcome).toBeNull();
    expect(cleared.outcomeFields).toBeNull();
    expect(cleared.outcomeAt).toBeNull();
  });

  it("stores session IDs for resume support", async () => {
    const prisma = getTestPrisma();

    const agent = await prisma.agent.create({ data: { name: "Session Agent" } });

    const run = await prisma.heartbeatRun.create({
      data: {
        agentId: agent.id,
        status: "succeeded",
        sessionIdBefore: "sess-abc",
        sessionIdAfter: "sess-def",
      },
    });

    const fetched = await prisma.heartbeatRun.findUnique({ where: { id: run.id } });
    expect(fetched!.sessionIdBefore).toBe("sess-abc");
    expect(fetched!.sessionIdAfter).toBe("sess-def");
  });
});
