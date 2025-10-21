import type { ProviderConfig } from "@/config";

const trimCandidate = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Normalize provider configuration so that both `baseUrl` and `baseURL` variants
 * are synchronized.
 *
 * The user configuration (providers.jsonc) stores `baseUrl` using lower camel case
 * for readability, but the Vercel AI SDK expects `baseURL`. This helper bridges the
 * gap without mutating the original configuration.
 */
export function normalizeProviderBaseUrl(config: ProviderConfig | undefined): ProviderConfig {
  if (!config) {
    return {};
  }

  const normalized: ProviderConfig = { ...config };
  const record = normalized as Record<string, unknown>;

  const baseUrl = trimCandidate(config.baseUrl) ?? trimCandidate(record.baseURL);

  if (baseUrl) {
    normalized.baseUrl = baseUrl;
    record.baseURL = baseUrl;
  } else {
    delete normalized.baseUrl;
    delete record.baseURL;
  }

  return normalized;
}

