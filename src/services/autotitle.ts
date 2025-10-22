import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import type { HistoryService } from "./historyService";
import { log } from "./log";
import { getTokenizerForModel } from "@/utils/main/tokenizer";

/**
 * AutotitleService - Generates concise titles for workspaces based on conversation history
 *
 * Key design decisions:
 * - Uses first 2-3 messages or ~2000 tokens from history (enough context without being expensive)
 * - Uses claude-haiku-4 for speed and cost (~$0.0025 per title)
 * - Generates after first assistant response and on compaction
 * - Never generates for empty workspaces to avoid "Untitled" placeholders
 */

const AUTOTITLE_TOKEN_LIMIT = 2000;
const AUTOTITLE_OUTPUT_TOKENS = 150;

/**
 * Prompt strategy: Ask for concise 3-7 word title that captures main topic
 * Emphasize ONLY the title (no quotes, no explanation) for clean output
 */
const TITLE_GENERATION_PROMPT = `Generate a concise 3-7 word title that captures the main topic of this conversation. Respond with ONLY the title, no quotes or explanation.`;

/**
 * Generate a workspace title based on conversation history
 * @param workspaceId - Workspace identifier
 * @param historyService - Service to retrieve chat history
 * @param model - Language model to use for generation (should be a fast, cheap model like haiku)
 * @returns Result containing generated title or error
 */
export async function generateWorkspaceTitle(
  workspaceId: string,
  historyService: HistoryService,
  model: LanguageModel
): Promise<Result<string, string>> {
  try {
    // Get conversation history
    const historyResult = await historyService.getHistory(workspaceId);
    if (!historyResult.success) {
      return Err(`Failed to get history: ${historyResult.error}`);
    }

    const messages = historyResult.data;

    // Don't generate title for empty workspaces
    if (messages.length === 0) {
      return Err("Cannot generate title for empty workspace");
    }

    // Take first few messages up to token limit
    // This gives enough context without excessive cost
    const modelStr = typeof model === "string" ? model : model.modelId;
    const tokenizer = getTokenizerForModel(modelStr);
    let tokensUsed = 0;
    const selectedMessages = [];

    for (const message of messages) {
      // Estimate tokens for this message
      const messageText = JSON.stringify(message);
      const messageTokens = await tokenizer.count(messageText);

      if (tokensUsed + messageTokens > AUTOTITLE_TOKEN_LIMIT) {
        break;
      }

      selectedMessages.push(message);
      tokensUsed += messageTokens;
    }

    // Need at least one message to generate a title
    if (selectedMessages.length === 0) {
      return Err("No messages available for title generation");
    }

    // Format messages for the model
    const conversationContext = selectedMessages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        // Handle both old string format and new content format
        let contentText: string;
        if (typeof msg.content === "string") {
          contentText = msg.content;
        } else if (Array.isArray(msg.content)) {
          contentText = msg.content
            .map((c: { type?: string; text?: string }) => {
              if ("text" in c && c.text) return c.text;
              return "[non-text content]";
            })
            .join(" ");
        } else {
          contentText = String(msg.content);
        }
        return `${role}: ${contentText}`;
      })
      .join("\n\n");

    log.debug(`[Autotitle] Generating title for workspace ${workspaceId}`, {
      messageCount: selectedMessages.length,
      tokensUsed,
    });

    // Generate title using AI
    const result = await generateText({
      model,
      prompt: `${conversationContext}\n\n${TITLE_GENERATION_PROMPT}`,
      maxTokens: AUTOTITLE_OUTPUT_TOKENS,
      temperature: 0.3, // Lower temperature for more focused titles
    });

    const title = result.text.trim();

    // Validate title length (should be reasonable)
    if (title.length === 0) {
      return Err("Generated title is empty");
    }

    if (title.length > 200) {
      // Truncate excessively long titles
      const truncated = title.substring(0, 200).trim();
      log.error(`[Autotitle] Generated title too long (${title.length} chars), truncated to 200`);
      return Ok(truncated);
    }

    log.debug(`[Autotitle] Generated title for workspace ${workspaceId}: "${title}"`);

    return Ok(title);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[Autotitle] Failed to generate title for workspace ${workspaceId}:`, error);
    return Err(`Title generation failed: ${message}`);
  }
}

