import type { CmuxMessage } from "../types/message";

/**
 * Transform CmuxMessage array to ensure tool calls and tool results are properly separated
 * for provider APIs.
 *
 * ## Design Choice: Provider-Specific Message Transformation
 *
 * ### The Problem
 * Our internal storage format (UIMessage/CmuxMessage) stores tool calls and their results
 * together in a single assistant message using `dynamic-tool` parts. This makes sense for:
 * - Storage efficiency (one message, not multiple)
 * - UI rendering (can show call + result together)
 * - Simplicity (temporal ordering preserved in single message)
 *
 * However, LLM provider APIs have **different requirements** for how tool calls must be structured:
 *
 * ### Provider Requirements
 *
 * **Anthropic (Strictest)**
 * - Assistant message with `tool_use` blocks
 * - **Must** be followed immediately by separate `tool` message with `tool_result` blocks
 * - API returns 400 error if tool_use found without corresponding tool_result in next message
 *
 * **OpenAI (Similar)**
 * - Assistant message with `tool_calls` array
 * - Followed by separate `tool` message with role="tool", tool_call_id, name, content
 * - More forgiving but still expects separation for proper multi-turn conversations
 *
 * **Google Gemini (Most Flexible)**
 * - Can append model's complete previous response to history
 * - Supports automatic function calling where SDK handles round-trips
 * - Less strict about message separation
 *
 * ### Why Transform on Load (Option 2)
 *
 * We chose to transform messages **before sending to API** rather than changing storage format because:
 *
 * 1. **No Data Migration** - Existing chat.jsonl files continue to work without conversion
 * 2. **Provider Flexibility** - Can adapt transformation logic per provider's requirements
 * 3. **Storage Simplicity** - Keep internal format simple and UI-friendly
 * 4. **Future-Proof** - New providers can get custom transformation logic
 * 5. **Non-Breaking** - Change is isolated to API boundary, not storage layer
 *
 * ### Alternative Approaches Considered
 *
 * **Option 1: Change Storage Format**
 * ❌ Requires migrating all existing chat.jsonl files
 * ❌ Makes storage more complex (3 messages instead of 1)
 * ❌ Harder to maintain temporal ordering for UI
 *
 * **Option 3: Custom Converter**
 * ❌ Replaces battle-tested `convertToModelMessages` from Vercel AI SDK
 * ❌ Would need to maintain compatibility with SDK's evolving format
 * ❌ More code to maintain
 *
 * ### Implementation Strategy
 *
 * This function:
 * 1. Detects provider from model string
 * 2. Applies provider-specific splitting logic
 * 3. Transforms `dynamic-tool` parts into proper message sequences
 * 4. Returns format suitable for `convertToModelMessages` → provider API
 *
 * The transformation is **only applied when loading chat history**, not during active streaming
 * (streaming already produces correctly-structured messages).
 */
export function splitToolCallsAndResults(
  messages: CmuxMessage[],
  modelString: string
): CmuxMessage[] {
  // Extract provider name from model string (format: "provider:model-id")
  const [providerName] = modelString.split(":");

  // Apply provider-specific transformation
  // Currently all providers benefit from splitting, but logic can diverge in future
  switch (providerName) {
    case "anthropic":
      return splitForAnthropic(messages);

    case "openai":
      return splitForOpenAI(messages);

    case "google":
      // Gemini is flexible, but we apply splitting for consistency
      return splitForGoogle(messages);

    default:
      // Unknown provider - apply most conservative (Anthropic-style) splitting
      return splitForAnthropic(messages);
  }
}

/**
 * Split messages for Anthropic API requirements.
 * Anthropic requires tool_use blocks in assistant message to be followed
 * immediately by a separate tool message with tool_result blocks.
 *
 * This function splits text that comes AFTER tool calls into a separate message.
 * The dynamic-tool parts with both input & output remain in the assistant message,
 * allowing convertToModelMessages to handle the conversion to Anthropic's format.
 */
function splitForAnthropic(messages: CmuxMessage[]): CmuxMessage[] {
  const result: CmuxMessage[] = [];

  for (const message of messages) {
    // Only assistant messages can have tool calls
    if (message.role !== "assistant") {
      result.push(message);
      continue;
    }

    // Find the index of the last dynamic-tool part
    let lastToolIndex = -1;
    for (let i = message.parts.length - 1; i >= 0; i--) {
      if (message.parts[i].type === "dynamic-tool") {
        lastToolIndex = i;
        break;
      }
    }

    // If no tools, or no parts after tools, pass through as-is
    if (lastToolIndex === -1 || lastToolIndex === message.parts.length - 1) {
      result.push(message);
      continue;
    }

    // Check if there are non-empty text parts after the last tool
    const partsAfterTools = message.parts.slice(lastToolIndex + 1);
    const hasTextAfterTools = partsAfterTools.some((part) => {
      if (part.type === "text") {
        return part.text && part.text.trim().length > 0;
      }
      return false; // Only text counts
    });

    if (!hasTextAfterTools) {
      result.push(message);
      continue;
    }

    // Split: everything up to and including last tool goes in first message
    const mainParts = message.parts.slice(0, lastToolIndex + 1);
    const afterParts = partsAfterTools;

    // Check if any of the main parts have tool results (output-available)
    const hasToolResults = mainParts.some(
      (part) => part.type === "dynamic-tool" && part.state === "output-available"
    );

    // 1. Main message with everything up to and including tools
    result.push({
      ...message,
      parts: mainParts,
    });

    // 2. If there were tool results, add a placeholder user message
    // This ensures Anthropic sees the tool results as coming "from" the user/environment
    if (hasToolResults) {
      result.push({
        id: `${message.id}-tool-response`,
        role: "user" as const,
        parts: [
          { type: "text" as const, text: "[Tool execution completed]", state: "done" as const },
        ],
        metadata: message.metadata,
      });
    }

    // 3. Continuation message with content after tools
    result.push({
      id: `${message.id}-continuation`,
      role: "assistant" as const,
      parts: afterParts,
      metadata: message.metadata,
    });
  }

  return result;
}

/**
 * Split messages for OpenAI API requirements.
 * Similar to Anthropic but may have different formatting needs in future.
 */
function splitForOpenAI(messages: CmuxMessage[]): CmuxMessage[] {
  // For now, OpenAI has similar requirements to Anthropic
  // If OpenAI-specific logic is needed, implement here
  return splitForAnthropic(messages);
}

/**
 * Split messages for Google Gemini API requirements.
 * Gemini is more flexible, but we apply splitting for consistency.
 */
function splitForGoogle(messages: CmuxMessage[]): CmuxMessage[] {
  // Gemini is flexible about message structure, but apply splitting
  // for consistency and to avoid potential issues
  return splitForAnthropic(messages);
}
