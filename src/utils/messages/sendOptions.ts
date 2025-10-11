import {
  getModelKey,
  getThinkingLevelKey,
  getModeKey,
  USE_1M_CONTEXT_KEY,
} from "@/constants/storage";
import { defaultModel } from "@/utils/ai/models";
import { modeToToolPolicy, PLAN_MODE_INSTRUCTION } from "@/utils/ui/modeUtils";
import { readPersistedState } from "@/hooks/usePersistedState";
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
  const model = readPersistedState<string>(getModelKey(workspaceId), defaultModel);

  // Read thinking level (workspace-specific)
  const thinkingLevel = readPersistedState<ThinkingLevel>(
    getThinkingLevelKey(workspaceId),
    "medium"
  );

  // Read mode (workspace-specific)
  const mode = readPersistedState<UIMode>(getModeKey(workspaceId), "exec");

  // Read 1M context (global)
  const use1M = readPersistedState<boolean>(USE_1M_CONTEXT_KEY, false);

  // Plan mode system instructions
  const additionalSystemInstructions = mode === "plan" ? PLAN_MODE_INSTRUCTION : undefined;

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
