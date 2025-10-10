import { createCmuxMessage } from "@/types/message";

/**
 * Start Here functionality - Replace chat history with a specific message.
 * This allows starting fresh from a plan or final assistant message.
 */
export async function startHereWithMessage(
  workspaceId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const summaryMessage = createCmuxMessage(
      `start-here-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      "assistant",
      content,
      {
        timestamp: Date.now(),
        compacted: true,
      }
    );

    const result = await window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);

    if (!result.success) {
      console.error("Failed to start here:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (err) {
    console.error("Start here error:", err);
    return { success: false, error: String(err) };
  }
}

