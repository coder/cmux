/**
 * OpenAI Reasoning Fetch Wrapper
 *
 * Intercepts requests to OpenAI's Responses API and strips problematic itemId
 * references that cause "reasoning without following item" errors.
 *
 * Works with any OpenAI-compatible endpoint (api.openai.com, Azure OpenAI,
 * OpenRouter, custom proxies) by detecting Responses API requests via the
 * presence of an 'input' field containing messages.
 *
 * This works at the HTTP level, which allows us to fix multi-step execution
 * that happens internally in the SDK (which middleware cannot intercept).
 *
 * The issue: During multi-step tool execution with reasoning models + web_search,
 * OpenAI assigns itemIds (ws_*, rs_*, fc_*) that create dangling references when
 * reasoning parts are missing from subsequent requests.
 *
 * Solution: Strip all itemIds from message content before sending to OpenAI.
 * OpenAI manages conversation state via previousResponseId, not itemIds.
 */

import { log } from "@/services/log";
import { Agent } from "undici";

// Create undici agent with unlimited timeouts for AI streaming requests
const unlimitedTimeoutAgent = new Agent({
  bodyTimeout: 0,
  headersTimeout: 0,
});

/**
 * Recursively strip itemId references from request body
 *
 * ItemIds appear in two places:
 * 1. providerOptions.openai.itemId (in message content parts)
 * 2. item_reference objects with { type: 'item_reference', id: 'ws_*' } (in input array)
 */
function stripItemIds(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    // Filter out item_reference objects from arrays
    return obj
      .filter((item) => {
        if (typeof item === "object" && item !== null) {
          const ref = item as Record<string, unknown>;
          // Remove item_reference objects that reference ws_*, rs_*, fc_* IDs
          if (ref.type === "item_reference" && typeof ref.id === "string") {
            const id = ref.id;
            if (id.startsWith("ws_") || id.startsWith("rs_") || id.startsWith("fc_")) {
              return false;
            }
          }
        }
        return true;
      })
      .map(stripItemIds);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip the entire providerOptions.openai subtree (contains itemIds)
    if (key === "providerOptions" && typeof value === "object" && value !== null) {
      const providerOpts = value as Record<string, unknown>;
      if ("openai" in providerOpts) {
        // Strip OpenAI provider options that contain itemIds
        const { openai: _removed, ...rest } = providerOpts;
        if (Object.keys(rest).length > 0) {
          result[key] = rest;
        }
        continue;
      }
    }

    // Recursively process nested objects
    result[key] = stripItemIds(value);
  }

  return result;
}

/**
 * Create a fetch wrapper that strips itemIds from OpenAI Responses API requests
 */
export function createOpenAIReasoningFetch(
  baseFetch?: typeof fetch
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const fetchFn = baseFetch ?? fetch;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Only intercept POST requests with JSON bodies
    if (init?.method === "POST") {
      try {
        // Parse request body
        const body = init.body;
        if (body && typeof body === "string") {
          const parsed = JSON.parse(body) as unknown;

          // Detect OpenAI Responses API requests by checking for 'input' field with messages
          // This works for api.openai.com, Azure OpenAI, OpenRouter, and custom endpoints
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "input" in parsed &&
            Array.isArray((parsed as { input?: unknown }).input)
          ) {
            // Strip itemIds from all messages
            const cleaned = stripItemIds(parsed);
            const cleanedBody = JSON.stringify(cleaned);

            // Log stripping for debugging
            if (body.length !== cleanedBody.length) {
              const originalCount = (body.match(/item_reference/g) ?? []).length;
              const cleanedCount = (cleanedBody.match(/item_reference/g) ?? []).length;
              log.debug(`[OpenAI Fetch] Stripped ${originalCount - cleanedCount} item_references`);
            }

            // Send cleaned request with unlimited timeout
            return fetchFn(input, {
              ...init,
              body: cleanedBody,
              dispatcher: unlimitedTimeoutAgent,
            } as RequestInit);
          }
        }
      } catch (error) {
        log.error("[OpenAI Fetch] Failed to process request body:", error);
        // Fall through to normal fetch on error
      }
    }

    // For non-OpenAI requests or GET requests, use normal fetch with unlimited timeout
    return fetchFn(input, { ...init, dispatcher: unlimitedTimeoutAgent } as RequestInit);
  };
}
