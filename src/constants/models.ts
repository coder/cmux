export const DEFAULT_MODEL = "anthropic:claude-opus-4-1" as const;

export const MODEL_ALIAS_MAP = {
  opus: DEFAULT_MODEL,
  sonnet: "anthropic:claude-sonnet-4",
} as const;

export type ModelAlias = keyof typeof MODEL_ALIAS_MAP;

export function resolveModelAlias(input: string): string | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return MODEL_ALIAS_MAP[normalized as ModelAlias];
}

export function getModelAliasEntries(): Array<{ alias: string; model: string }> {
  return Object.entries(MODEL_ALIAS_MAP).map(([alias, model]) => ({ alias, model }));
}
