# muxAI Solana programs

Anchor workspace for muxAI's on-chain components. Currently contains one program:

## `decision-log`

Records AI agent trade decisions as on-chain PDAs. Every decision is a tamper-evident public record signed by the agent's Solana wallet, queryable by any dApp via standard Solana RPC calls.

### Account layout

Seeds: `[b"decision", agent_pubkey, run_id]`

| Field | Type | Purpose |
|---|---|---|
| `agent` | `Pubkey` | Agent's Solana wallet — the signer of the publish tx |
| `run_id` | `[u8; 16]` | 16-byte run id from muxAI's `HeartbeatRun` |
| `ts` | `i64` | Unix timestamp from the cluster clock |
| `asset` | `String` (≤32) | e.g. `"SOL/USDT"` |
| `side` | `enum` | `Long` or `Short` |
| `entry` / `stop_loss` / `take_profit` | `u64` | Prices × 10⁶ (6-decimal fixed-point; Solana programs don't do floats) |
| `size_pct` | `u8` | 0..100 |
| `confidence` | `u8` | 0..100 |
| `content_hash` | `[u8; 32]` | SHA-256 of the full decision JSON (the full payload lives off-chain) |
| `thesis_uri` | `String` (≤200) | Optional HTTP/Arweave/IPFS link to the full thesis |

Size: ~370 bytes, rent-exempt. One-time cost ~0.003 SOL per decision (refundable if the account is closed).

## Build & test locally

Requires Rust, Solana CLI ≥ 2.0, Anchor CLI 0.31.1.

```bash
cd solana
pnpm install
anchor build
anchor keys sync     # writes the generated program id into declare_id! + Anchor.toml
anchor test          # boots a local validator, deploys, runs tests/decision-log.ts
```

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2                    # ~5 SOL needed to deploy
anchor build
anchor deploy --provider.cluster devnet
```

After the first successful devnet deploy, note the program id printed at the end — it's also stored at `target/deploy/decision_log-keypair.json`.

## Querying decisions

Every decision PDA can be fetched directly with the program IDL (`target/idl/decision_log.json`) or filtered server-side:

```ts
// all decisions by one agent
await program.account.decision.all([
  { memcmp: { offset: 8, bytes: agentPubkey.toBase58() } }
]);
```

The `agent` field is the first field after the 8-byte account discriminator, so `memcmp` at offset 8 filters by signer in one RPC call — no indexer required.

## License

MIT — same as the rest of muxAI.
