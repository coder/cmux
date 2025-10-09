import { getModelKey, getThinkingLevelKey } from "@/constants/storage";
import { defaultModel } from "@/utils/ai/models";
import { modeToToolPolicy } from "@/utils/ui/modeUtils";
import type { SendMessageOptions } from "@/types/ipc";
import type { UIMode } from "@/types/mode";
import type { ThinkingLevel } from "@/types/thinking";

/**
 * Get send options from localStorage
 * Mirrors logic from useSendMessageOptions but works outside React context
 *
 * Used by useResumeManager for auto-retry without hook dependencies.
 * This ensures DRY - single source of truth for option extraction.
 */
export function getSendOptionsFromStorage(workspaceId: string): SendMessageOptions {
  // Read model preference (workspace-specific)
  const modelRaw = localStorage.getItem(getModelKey(workspaceId));
  const model = typeof modelRaw === "string" && modelRaw ? modelRaw : defaultModel;

  // Read thinking level (workspace-specific)
  const thinkingLevelRaw = localStorage.getItem(getThinkingLevelKey(workspaceId));
  const thinkingLevel = (thinkingLevelRaw as ThinkingLevel) || "medium";

  // Read mode (workspace-specific)
  const modeRaw = localStorage.getItem(`mode:${workspaceId}`);
  const mode = (modeRaw as UIMode) || "exec";

  // Read 1M context (global)
  const use1M = localStorage.getItem("use1MContext") === "true";

  // Plan mode system instructions
  const additionalSystemInstructions =
    mode === "plan"
      ? "You are in Plan Mode. You may use tools to research and understand the task, but you MUST call the propose_plan tool with your findings before completing your response. Do not provide a text response without calling propose_plan."
      : undefined;

  return {
    model,
    thinkingLevel,
    toolPolicy: modeToToolPolicy(mode),
    additionalSystemInstructions,
    providerOptions: {
      anthropic: {
        use1MContext: use1M,
      },
    },
  };
}
