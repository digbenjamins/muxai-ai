# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

### Fixed

## [0.1.2] - 2026-04-18

### Added

- Decision recall for trading agents: `reviewDecisions` template flag plus `mcp__orchestrator__get_my_decisions` tool surfaces an agent's last decisions and user-marked outcomes on its next run, with a win/loss tally and reflection nudge
- Outcome tracking on runs: `outcome` label (user-definable — Win / Loss / NA / custom) plus free-form `outcomeFields` key/value pairs (pnl, note, fees, etc.), editable from the run detail page
- Compact Recent Runs layout on agent detail and `/agents/[id]/runs` pages, with one-line decision summary plucked from the agent's `resultCard` slots and an outcome badge
- Bump default model to `claude-opus-4-7`; Technical Analyst template updated from `claude-opus-4-6` to `claude-opus-4-7`

### Fixed

- Guard wallet-key JSON parsing in `services/wallet.ts` so corrupted records surface a clear error instead of crashing callers
- Deep-merge `adapterConfig` on `PATCH /api/agents/:id` so nested fields (`resultCard.fields`, etc.) are no longer wiped by partial updates
- Periodically sweep stale entries from the SSE replay buffer (`services/run-events.ts`) so orphan runs don't leak memory
- Reject `POST /api/agents/:id/invoke` with 409 when the agent is already running, preventing duplicate concurrent spawns
- Close child stdin after the handshake in the MCP server test route so processes exit cleanly
- Return a proper MCP `isError` response for unknown tool names in `mcp-crypto-data`

## [0.1.1] - 2026-04-09

Initial release.
