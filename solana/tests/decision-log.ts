import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { DecisionLog } from "../target/types/decision_log";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { createHash, randomBytes } from "crypto";

describe("decision-log", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DecisionLog as Program<DecisionLog>;

  it("publishes a trade decision", async () => {
    const runId = randomBytes(16);

    const [decisionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("decision"), provider.wallet.publicKey.toBuffer(), runId],
      program.programId
    );

    const contentHash = Array.from(
      createHash("sha256").update("test-decision-payload").digest()
    );

    await program.methods
      .publishDecision(
        Array.from(runId),
        "SOL/USDT",
        { long: {} },
        new BN(142_500_000),
        new BN(138_200_000),
        new BN(148_000_000),
        3,
        74,
        contentHash,
        "https://muxai.example/runs/test"
      )
      .accounts({
        decision: decisionPda,
        agent: provider.wallet.publicKey,
      })
      .rpc();

    const stored = await program.account.decision.fetch(decisionPda);
    expect(stored.asset).to.equal("SOL/USDT");
    expect(stored.sizePct).to.equal(3);
    expect(stored.confidence).to.equal(74);
    expect(stored.entry.toString()).to.equal("142500000");
    expect(stored.agent.toString()).to.equal(
      provider.wallet.publicKey.toString()
    );
  });

  it("rejects size_pct > 100", async () => {
    const runId = randomBytes(16);
    const [decisionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("decision"), provider.wallet.publicKey.toBuffer(), runId],
      program.programId
    );
    const contentHash = Array.from(createHash("sha256").update("x").digest());

    try {
      await program.methods
        .publishDecision(
          Array.from(runId),
          "BTC/USDT",
          { short: {} },
          new BN(1),
          new BN(1),
          new BN(1),
          200,
          50,
          contentHash,
          ""
        )
        .accounts({ decision: decisionPda, agent: provider.wallet.publicKey })
        .rpc();
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.toString()).to.include("InvalidSizePct");
    }
  });
});
