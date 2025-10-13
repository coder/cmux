/**
 * Transform ModelMessages to ensure Anthropic API compliance.
 * This operates on already-converted ModelMessages from Vercel AI SDK.
 */

import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";
import type { CmuxMessage } from "@/types/message";

/**
 * Filter out assistant messages that only contain reasoning parts (no text or tool parts).
 * These messages are invalid for the API and provide no value to the model.
 * This happens when a message is interrupted during thinking before producing any text.
 *
 * Note: This function filters out reasoning-only messages but does NOT strip reasoning
 * parts from messages that have other content. Reasoning parts are handled differently
 * per provider (see stripReasoningForOpenAI).
 */
export function filterEmptyAssistantMessages(messages: CmuxMessage[]): CmuxMessage[] {
  return messages.filter((msg) => {
    // Keep all non-assistant messages
    if (msg.role !== "assistant") {
      return true;
    }

    // Keep assistant messages that have at least one text or tool part
    const hasContent = msg.parts.some(
      (part) => (part.type === "text" && part.text) || part.type === "dynamic-tool"
    );

    return hasContent;
  });
}

/**
 * Strip reasoning parts from messages for OpenAI.
 *
 * OpenAI's Responses API uses encrypted reasoning items (with IDs like rs_*) that are
 * managed automatically via previous_response_id. When reasoning parts from history
 * (which are Anthropic-style text-based reasoning) are sent to OpenAI, they create
 * orphaned reasoning items that cause "reasoning without following item" errors.
 *
 * Anthropic's reasoning (text-based) is different and SHOULD be sent back via sendReasoning.
 *
 * @param messages - Messages that may contain reasoning parts
 * @returns Messages with reasoning parts stripped (for OpenAI only)
 */
export function stripReasoningForOpenAI(messages: CmuxMessage[]): CmuxMessage[] {
  return messages.map((msg) => {
    // Only process assistant messages
    if (msg.role !== "assistant") {
      return msg;
    }

    // Strip reasoning parts - OpenAI manages reasoning via previousResponseId
    const filteredParts = msg.parts.filter((part) => part.type !== "reasoning");

    return {
      ...msg,
      parts: filteredParts,
    };
  });
}

/**
 * Add [CONTINUE] sentinel to partial messages by inserting a user message.
 * This helps the model understand that a message was interrupted and to continue.
 * The sentinel is ONLY for model context, not shown in UI.
 *
 * OPTIMIZATION: If a user message already follows the partial assistant message,
 * we skip the sentinel - the user message itself provides the continuation signal.
 * This saves tokens and creates more natural conversation flow.
 *
 * We insert a separate user message instead of modifying the assistant message
 * because if the assistant message only has reasoning (no text), it will be
 * filtered out, and we'd lose the interruption context. A user message always
 * survives filtering.
 */
export function addInterruptedSentinel(messages: CmuxMessage[]): CmuxMessage[] {
  const result: CmuxMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    result.push(msg);

    // If this is a partial assistant message, conditionally insert [CONTINUE] sentinel
    if (msg.role === "assistant" && msg.metadata?.partial) {
      const nextMsg = messages[i + 1];

      // Only add sentinel if there's NO user message following
      // If user message follows, it provides the continuation context itself
      if (!nextMsg || nextMsg.role !== "user") {
        result.push({
          id: `interrupted-${msg.id}`,
          role: "user",
          parts: [{ type: "text", text: "[CONTINUE]" }],
          metadata: {
            timestamp: msg.metadata.timestamp,
            // Mark as synthetic so it can be identified if needed
            synthetic: true,
          },
        });
      }
    }
  }

  return result;
}

/**
 * Inject mode transition context when mode changes mid-conversation.
 * Inserts a synthetic user message before the final user message to signal the mode switch.
 * This provides temporal context that helps models understand they should follow new mode instructions.
 *
 * @param messages The conversation history
 * @param currentMode The mode for the upcoming assistant response (e.g., "plan", "exec")
 * @returns Messages with mode transition context injected if needed
 */
export function injectModeTransition(messages: CmuxMessage[], currentMode?: string): CmuxMessage[] {
  // No mode specified, nothing to do
  if (!currentMode) {
    return messages;
  }

  // Need at least one message to have a conversation
  if (messages.length === 0) {
    return messages;
  }

  // Find the last assistant message to check its mode
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const lastMode = lastAssistantMessage?.metadata?.mode;

  // No mode transition if no previous mode or same mode
  if (!lastMode || lastMode === currentMode) {
    return messages;
  }

  // Mode transition detected! Inject a synthetic user message before the last user message
  // This provides temporal context: user says "switch modes" before their actual request
  
  // Find the index of the last user message
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  // If there's no user message, can't inject transition (nothing to inject before)
  if (lastUserIndex === -1) {
    return messages;
  }

  const result: CmuxMessage[] = [];

  // Add all messages up to (but not including) the last user message
  for (let i = 0; i < lastUserIndex; i++) {
    result.push(messages[i]);
  }

  // Inject mode transition message right before the last user message
  const transitionMessage: CmuxMessage = {
    id: `mode-transition-${Date.now()}`,
    role: "user",
    parts: [
      {
        type: "text",
        text: `[Mode switched from ${lastMode} to ${currentMode}. Follow ${currentMode} mode instructions.]`,
      },
    ],
    metadata: {
      timestamp: Date.now(),
      synthetic: true,
    },
  };
  result.push(transitionMessage);

  // Add the last user message and any remaining messages
  for (let i = lastUserIndex; i < messages.length; i++) {
    result.push(messages[i]);
  }

  return result;
}



/**
 * Split assistant messages with mixed text and tool calls into separate messages
 * to comply with Anthropic's requirement that tool_use blocks must be immediately
 * followed by their tool_result blocks without intervening text.
 */
function splitMixedContentMessages(messages: ModelMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Only process assistant messages
    if (msg.role !== "assistant") {
      result.push(msg);
      continue;
    }

    const assistantMsg = msg;

    // AssistantContent can be string or array, handle both cases
    if (typeof assistantMsg.content === "string") {
      // If content is just a string, no tool calls to worry about
      result.push(msg);
      continue;
    }

    // Check if this assistant message has both text and tool calls
    const textParts = assistantMsg.content.filter((c) => c.type === "text" && c.text.trim());
    const toolCallParts = assistantMsg.content.filter((c) => c.type === "tool-call");

    // Check if the next message is a tool result message
    const nextMsg = messages[i + 1];
    const hasToolResults = nextMsg?.role === "tool";

    // If no tool calls, keep as-is
    if (toolCallParts.length === 0) {
      result.push(msg);
      continue;
    }

    // If we have tool calls but no text
    if (textParts.length === 0) {
      if (hasToolResults) {
        // Filter tool calls to only include those with results
        const toolMsg = nextMsg;
        const resultIds = new Set(
          toolMsg.content
            .filter((r) => r.type === "tool-result")
            .map((r) => (r.type === "tool-result" ? r.toolCallId : ""))
        );

        const validToolCalls = toolCallParts.filter(
          (p) => p.type === "tool-call" && resultIds.has(p.toolCallId)
        );

        if (validToolCalls.length > 0) {
          // Only include tool calls that have results
          result.push({
            role: "assistant",
            content: validToolCalls,
          });
        }
        // Skip if no valid tool calls remain
      }
      // Skip orphaned tool calls - they violate API requirements
      continue;
    }

    // If we have tool calls that will be followed by results,
    // we need to ensure no text appears between them
    if (hasToolResults) {
      const toolMsg = nextMsg;

      // Find positions of text and tool calls in content array
      const contentWithPositions = assistantMsg.content.map((c, idx) => ({
        content: c,
        index: idx,
      }));

      // Group consecutive parts by type
      type ContentArray = Exclude<typeof assistantMsg.content, string>;
      const groups: Array<{ type: "text" | "tool-call"; parts: ContentArray }> = [];
      let currentGroup: { type: "text" | "tool-call"; parts: ContentArray } | null = null;

      for (const item of contentWithPositions) {
        const partType = item.content.type === "text" ? "text" : "tool-call";

        if (!currentGroup || currentGroup.type !== partType) {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { type: partType, parts: [] };
        }

        currentGroup.parts.push(item.content);
      }

      if (currentGroup) groups.push(currentGroup);

      // If we have alternating text and tool calls, we need to split them
      if (groups.length > 1) {
        // Process each group
        for (const group of groups) {
          if (group.parts.length > 0) {
            let partsToInclude = group.parts;

            // If this is a tool-call group, filter to only include tool calls that have results
            if (group.type === "tool-call" && hasToolResults) {
              // Get the IDs of tool calls that have results
              const resultIds = new Set(
                toolMsg.content
                  .filter((r) => r.type === "tool-result")
                  .map((r) => (r.type === "tool-result" ? r.toolCallId : ""))
              );

              // Only include tool calls that have corresponding results
              partsToInclude = group.parts.filter(
                (p) => p.type === "tool-call" && resultIds.has(p.toolCallId)
              );
            }

            // Only create assistant message if there are parts to include
            if (partsToInclude.length > 0) {
              const newAssistantMsg: AssistantModelMessage = {
                role: "assistant",
                content: partsToInclude,
              };
              result.push(newAssistantMsg);

              // If this group has tool calls that need results,
              // add the tool results right after
              if (group.type === "tool-call" && hasToolResults) {
                // Get the tool call IDs from filtered parts
                const toolCallIds = new Set(
                  partsToInclude
                    .filter((p) => p.type === "tool-call")
                    .map((p) => (p.type === "tool-call" ? p.toolCallId : ""))
                    .filter(Boolean)
                );

                // Filter the tool results to only include those for these tool calls
                const relevantResults = toolMsg.content.filter(
                  (r) => r.type === "tool-result" && toolCallIds.has(r.toolCallId)
                );

                if (relevantResults.length > 0) {
                  const newToolMsg: ToolModelMessage = {
                    role: "tool",
                    content: relevantResults,
                  };
                  result.push(newToolMsg);
                }
              }
            }
          }
        }

        // Skip the original tool result message since we've redistributed its contents
        if (hasToolResults) {
          i++; // Skip next message
        }
      } else {
        // No splitting needed, keep as-is
        result.push(msg);
      }
    } else {
      // No tool results follow, which means these tool calls were interrupted
      // Both Anthropic and OpenAI APIs require EVERY tool_use to have a tool_result,
      // so we must strip out interrupted tool calls entirely. The text content with
      // [INTERRUPTED] sentinel gives the model enough context.

      // Only include text parts (strip out interrupted tool calls)
      if (textParts.length > 0) {
        const textMsg: AssistantModelMessage = {
          role: "assistant",
          content: textParts,
        };
        result.push(textMsg);
      }

      // DO NOT include tool calls without results - they violate API requirements
      // The interrupted tool calls are preserved in chat.jsonl for UI display, but
      // excluded from API calls since they have no results
    }
  }

  return result;
}

/**
 * Filter out assistant messages that only contain reasoning parts (no text or tool parts).
 * Anthropic API rejects messages that have reasoning but no actual content.
 * This happens when a message is interrupted during thinking before producing any text.
 */
function filterReasoningOnlyMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((msg) => {
    if (msg.role !== "assistant") {
      return true;
    }

    // Check if content is string or array
    if (typeof msg.content === "string") {
      return msg.content.trim().length > 0;
    }

    // For array content, check if there's at least one non-reasoning part
    const hasNonReasoningContent = msg.content.some((part) => part.type !== "reasoning");

    return hasNonReasoningContent;
  });
}

/**
 * Strip reasoning parts from assistant messages.
 * OpenAI's Responses API has its own reasoning format (encrypted reasoning items with IDs).
 * Anthropic's text-based reasoning parts are incompatible and must be removed.
 * This function removes reasoning parts while preserving text and tool-call parts.
 */
function stripReasoningParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    // Only process assistant messages with array content
    if (msg.role !== "assistant") {
      return msg;
    }

    const assistantMsg = msg;

    // Skip string content (no reasoning parts to strip)
    if (typeof assistantMsg.content === "string") {
      return msg;
    }

    // Filter out reasoning parts, keep everything else
    const filteredContent = assistantMsg.content.filter((part) => part.type !== "reasoning");

    // If all content was filtered out, this message will be caught by filterReasoningOnlyMessages
    return {
      ...assistantMsg,
      content: filteredContent,
    };
  });
}

/**
 * Coalesce consecutive parts of the same type within each message.
 * Streaming creates many individual text/reasoning parts; merge them for easier debugging.
 * Also reduces JSON overhead when sending messages to the API.
 * Tool calls remain atomic (not merged).
 */
function coalesceConsecutiveParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    // Only process assistant messages with array content
    if (msg.role !== "assistant") {
      return msg;
    }

    const assistantMsg = msg;

    // Skip string content
    if (typeof assistantMsg.content === "string") {
      return msg;
    }

    // Now TypeScript knows content is an array
    type ContentArray = Exclude<typeof assistantMsg.content, string>;
    const coalesced: ContentArray = [];

    for (const part of assistantMsg.content) {
      const lastPart = coalesced[coalesced.length - 1];

      // Merge consecutive text parts
      if (part.type === "text" && lastPart?.type === "text") {
        lastPart.text += part.text;
        continue;
      }

      // Merge consecutive reasoning parts (extended thinking)
      if (part.type === "reasoning" && lastPart?.type === "reasoning") {
        lastPart.text += part.text;
        continue;
      }

      // Keep tool calls and first occurrence of each type
      coalesced.push(part);
    }

    return {
      ...assistantMsg,
      content: coalesced,
    };
  });
}

/**
 * Merge consecutive user messages with newline separators.
 * When filtering removes assistant messages, we can end up with consecutive user messages.
 * Anthropic requires alternating user/assistant, so we merge them.
 */
function mergeConsecutiveUserMessages(messages: ModelMessage[]): ModelMessage[] {
  const merged: ModelMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user" && merged.length > 0 && merged[merged.length - 1].role === "user") {
      // Consecutive user message - merge with previous
      const prevMsg = merged[merged.length - 1];

      // Get text content from both messages
      const prevText = Array.isArray(prevMsg.content)
        ? (prevMsg.content.find((c) => c.type === "text")?.text ?? "")
        : prevMsg.content;

      const currentText = Array.isArray(msg.content)
        ? (msg.content.find((c) => c.type === "text")?.text ?? "")
        : typeof msg.content === "string"
          ? msg.content
          : "";

      // Merge with newline prefix
      const mergedText = prevText + "\n" + currentText;

      // Collect image parts from both messages
      const prevImageParts = Array.isArray(prevMsg.content)
        ? prevMsg.content.filter((c) => c.type === "image")
        : [];
      const currentImageParts = Array.isArray(msg.content)
        ? msg.content.filter((c) => c.type === "image")
        : [];

      // Update the previous message with merged text and all image parts
      merged[merged.length - 1] = {
        role: "user",
        content: [
          { type: "text" as const, text: mergedText },
          ...prevImageParts,
          ...currentImageParts,
        ],
      };
    } else {
      // Not consecutive user message, add as-is
      merged.push(msg);
    }
  }

  return merged;
}

/**
 * Transform messages to ensure provider API compliance.
 * Applies multiple transformation passes based on provider requirements:
 * 0. Coalesce consecutive parts (text/reasoning) - all providers, reduces JSON overhead
 * 1. Split mixed content messages (text + tool calls) - all providers
 * 2. Strip/filter reasoning parts:
 *    - OpenAI: Strip all Anthropic reasoning parts (incompatible format)
 *    - Anthropic: Filter out reasoning-only messages (API rejects them)
 * 3. Merge consecutive user messages - all providers
 *
 * Note: encryptedContent stripping happens earlier in streamManager when tool results
 * are first stored, not during message transformation.
 *
 * @param messages The messages to transform
 * @param provider The provider name (e.g., "anthropic", "openai")
 */
export function transformModelMessages(messages: ModelMessage[], provider: string): ModelMessage[] {
  // Pass 0: Coalesce consecutive parts to reduce JSON overhead from streaming (applies to all providers)
  const coalesced = coalesceConsecutiveParts(messages);

  // Pass 1: Split mixed content messages (applies to all providers)
  const split = splitMixedContentMessages(coalesced);

  // Pass 2: Provider-specific reasoning handling
  let reasoningHandled: ModelMessage[];
  if (provider === "openai") {
    // OpenAI: Strip all reasoning parts (Anthropic's text-based reasoning is incompatible with OpenAI's format)
    reasoningHandled = stripReasoningParts(split);
    // Then filter out any messages that became empty after stripping
    reasoningHandled = filterReasoningOnlyMessages(reasoningHandled);
  } else if (provider === "anthropic") {
    // Anthropic: Filter out reasoning-only messages (API rejects messages with only reasoning)
    reasoningHandled = filterReasoningOnlyMessages(split);
  } else {
    // Unknown provider: no reasoning handling
    reasoningHandled = split;
  }

  // Pass 3: Merge consecutive user messages (applies to all providers)
  const merged = mergeConsecutiveUserMessages(reasoningHandled);

  return merged;
}

/**
 * Validate that the transformed messages follow Anthropic's requirements:
 * - Every tool-call must be immediately followed by its tool-result
 * - No text can appear between tool-call and tool-result
 */
export function validateAnthropicCompliance(messages: ModelMessage[]): {
  valid: boolean;
  error?: string;
} {
  const pendingToolCalls = new Map<string, number>(); // toolCallId -> message index

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === "assistant") {
      const assistantMsg = msg;

      // Skip if content is just a string
      if (typeof assistantMsg.content === "string") {
        continue;
      }

      // Track any tool calls in this message
      for (const content of assistantMsg.content) {
        if (content.type === "tool-call") {
          pendingToolCalls.set(content.toolCallId, i);
        }
      }

      // If we have pending tool calls and encounter text or more tool calls,
      // check if the next message has the results
      if (pendingToolCalls.size > 0) {
        const nextMsg = messages[i + 1];

        // The next message MUST be a tool result message if we have pending calls
        if (!nextMsg || nextMsg.role !== "tool") {
          const pendingIds = Array.from(pendingToolCalls.keys()).join(", ");
          return {
            valid: false,
            error: `Message ${i}: tool_use blocks found without tool_result blocks immediately after: ${pendingIds}`,
          };
        }
      }
    } else if (msg.role === "tool") {
      const toolMsg = msg;

      // Process tool results and clear pending calls
      for (const content of toolMsg.content) {
        if (content.type === "tool-result") {
          const toolCallId = content.toolCallId;

          // Check if this result corresponds to a pending call
          if (!pendingToolCalls.has(toolCallId)) {
            return {
              valid: false,
              error: `Message ${i}: tool_result for ${toolCallId} has no corresponding tool_use`,
            };
          }

          // Check if the tool call was in the immediately previous assistant message
          const callIndex = pendingToolCalls.get(toolCallId);
          if (callIndex !== i - 1) {
            return {
              valid: false,
              error: `Message ${i}: tool_result for ${toolCallId} is not immediately after its tool_use (was in message ${callIndex ?? "unknown"})`,
            };
          }

          pendingToolCalls.delete(toolCallId);
        }
      }
    }
  }

  // Check for any remaining pending tool calls
  if (pendingToolCalls.size > 0) {
    const pendingIds = Array.from(pendingToolCalls.keys()).join(", ");
    return {
      valid: false,
      error: `Unresolved tool_use blocks without corresponding tool_result: ${pendingIds}`,
    };
  }

  return { valid: true };
}
