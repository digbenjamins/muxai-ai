// Source of truth for the Claude models exposed in the UI.
// Keep DEFAULT_MODEL in sync with apps/api/src/services/models.ts.

export const MODELS = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
] as const;

export type ModelId = typeof MODELS[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-4-7";
