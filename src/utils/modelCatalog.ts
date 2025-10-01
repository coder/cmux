import modelsData from "./models.json";

interface RawModelData {
  litellm_provider?: string;
  mode?: string;
  [key: string]: unknown;
}

const PROVIDER_ALIASES: Record<string, string[]> = {
  anthropic: ["anthropic"],
  openai: ["openai"],
  google: [
    "google",
    "google_ai_studio",
    "vertex_ai-chat-models",
    "vertex_ai-language-models",
    "vertex_ai-code-chat-models",
    "vertex_ai-code-text-models",
    "vertex_ai-text-models",
  ],
};

const TEXTUAL_MODE_KEYWORDS = ["chat", "completion", "text", "responses"];
const EXCLUDED_MODE_KEYWORDS = ["audio", "image", "video", "embedding", "moderation", "rerank"];

function isTextualMode(mode: unknown): boolean {
  if (typeof mode !== "string" || mode.length === 0) {
    return true;
  }

  const normalized = mode.toLowerCase();

  if (EXCLUDED_MODE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return false;
  }

  return TEXTUAL_MODE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function shouldIncludeModelName(name: string): boolean {
  if (!name || typeof name !== "string") {
    return false;
  }

  if (name.includes("/")) {
    return false;
  }

  if (name.includes("@")) {
    return false;
  }

  if (name.startsWith("ft:")) {
    return false;
  }

  return true;
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

const providerModelCache = new Map<string, string[]>();

export function getModelsForProvider(provider: string): string[] {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) {
    return [];
  }

  const cached = providerModelCache.get(normalizedProvider);
  if (cached) {
    return cached;
  }

  const aliases = PROVIDER_ALIASES[normalizedProvider] ?? [normalizedProvider];
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));

  const results = new Set<string>();
  const data = modelsData as Record<string, RawModelData>;

  for (const [name, info] of Object.entries(data)) {
    if (!shouldIncludeModelName(name)) {
      continue;
    }

    const providerId = info.litellm_provider?.toLowerCase();
    if (!providerId || !aliasSet.has(providerId)) {
      continue;
    }

    if (!isTextualMode(info.mode)) {
      continue;
    }

    // Remove regional prefixes like "us." or "eu." when they mirror the same model name
    const normalizedName = name.startsWith("us.") || name.startsWith("eu.") ? name.split(".").slice(1).join(".") : name;
    results.add(normalizedName);
  }

  const sorted = Array.from(results).sort((a, b) => a.localeCompare(b));
  providerModelCache.set(normalizedProvider, sorted);
  return sorted;
}
