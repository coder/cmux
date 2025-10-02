/**
 * Transform ModelMessages to ensure Anthropic API compliance.
 * This operates on already-converted ModelMessages from Vercel AI SDK.
 */

import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";
import type { CmuxMessage } from "../types/message";

/**
 * Filter out assistant messages that only contain reasoning parts (no text or tool parts).
 * These messages are invalid for the API and provide no value to the model.
 * This happens when a message is interrupted during thinking before producing any text.
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
 * Add [INTERRUPTED] sentinel to partial messages by inserting a user message.
 * This helps the model understand that a message was interrupted and incomplete.
 * The sentinel is ONLY for model context, not shown in UI.
 *
 * We insert a separate user message instead of modifying the assistant message
 * because if the assistant message only has reasoning (no text), it will be
 * filtered out, and we'd lose the interruption context. A user message always
 * survives filtering.
 */
export function addInterruptedSentinel(messages: CmuxMessage[]): CmuxMessage[] {
  const result: CmuxMessage[] = [];

  for (const msg of messages) {
    result.push(msg);

    // If this is a partial assistant message, insert [INTERRUPTED] user message after it
    if (msg.role === "assistant" && msg.metadata?.partial) {
      result.push({
        id: `interrupted-${msg.id}`,
        role: "user",
        parts: [{ type: "text", text: "[INTERRUPTED]" }],
        metadata: {
          timestamp: msg.metadata.timestamp,
          // Mark as synthetic so it can be identified if needed
          synthetic: true,
        },
      });
    }
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

    // If no tool calls or no text, keep as-is
    if (toolCallParts.length === 0 || textParts.length === 0) {
      result.push(msg);
      continue;
    }

    // Check if the next message is a tool result message
    const nextMsg = messages[i + 1];
    const hasToolResults = nextMsg?.role === "tool";

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
      // Anthropic API requires EVERY tool_use to have a tool_result, so we must
      // strip out interrupted tool calls entirely. The text content with
      // [INTERRUPTED] sentinel gives the model enough context.

      // Only include text parts (strip out interrupted tool calls)
      if (textParts.length > 0) {
        const textMsg: AssistantModelMessage = {
          role: "assistant",
          content: textParts,
        };
        result.push(textMsg);
      }

      // DO NOT include tool calls without results - they violate Anthropic API requirements
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

      // Update the previous message
      merged[merged.length - 1] = {
        role: "user",
        content: [{ type: "text", text: mergedText }],
      };
    } else {
      // Not consecutive user message, add as-is
      merged.push(msg);
    }
  }

  return merged;
}

/**
 * Transform messages to ensure Anthropic API compliance.
 * Applies multiple transformation passes:
 * 1. Split mixed content messages (text + tool calls)
 * 2. Filter out reasoning-only assistant messages
 * 3. Merge consecutive user messages
 */
export function transformModelMessages(messages: ModelMessage[]): ModelMessage[] {
  // Pass 1: Split mixed content messages
  const split = splitMixedContentMessages(messages);

  // Pass 2: Filter out reasoning-only assistant messages
  const filtered = filterReasoningOnlyMessages(split);

  // Pass 3: Merge consecutive user messages
  const merged = mergeConsecutiveUserMessages(filtered);

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
              error: `Message ${i}: tool_result for ${toolCallId} is not immediately after its tool_use (was in message ${callIndex})`,
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
