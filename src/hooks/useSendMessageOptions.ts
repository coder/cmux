import { use1MContext } from "./use1MContext";
import { useThinkingLevel } from "./useThinkingLevel";
import { useMode } from "@/contexts/ModeContext";
import { usePersistedState } from "./usePersistedState";
import { modeToToolPolicy } from "@/utils/ui/modeUtils";
import { defaultModel } from "@/utils/ai/models";
import type { SendMessageOptions } from "@/types/ipc";

/**
 * Build SendMessageOptions from current user preferences
 * This ensures all message sends (new, retry, resume) use consistent options
 * 
 * Single source of truth for message options - guarantees parity between
 * ChatInput, RetryBarrier, and any other components that send messages.
 * 
 * Uses usePersistedState which has listener mode, so changes to preferences
 * propagate automatically to all components using this hook.
 */
export function useSendMessageOptions(workspaceId: string): SendMessageOptions {
  const [use1M] = use1MContext();
  const [thinkingLevel] = useThinkingLevel();
  const [mode] = useMode();
  const [preferredModel] = usePersistedState<string>(
    `${workspaceId}-preferredModel`,
    defaultModel
  );
  
  const additionalSystemInstructions =
    mode === "plan"
      ? "You are in Plan Mode. You may use tools to research and understand the task, but you MUST call the propose_plan tool with your findings before completing your response. Do not provide a text response without calling propose_plan."
      : undefined;
  
  return {
    thinkingLevel,
    model: preferredModel,
    toolPolicy: modeToToolPolicy(mode),
    additionalSystemInstructions,
    providerOptions: {
      anthropic: {
        use1MContext: use1M,
      },
    },
  };
}
