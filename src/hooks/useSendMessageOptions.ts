import { use1MContext } from "./use1MContext";
import { useThinkingLevel } from "./useThinkingLevel";
import { useMode } from "@/contexts/ModeContext";
import { usePersistedState } from "./usePersistedState";
import { modeToToolPolicy, PLAN_MODE_INSTRUCTION } from "@/utils/ui/modeUtils";
import { defaultModel } from "@/utils/ai/models";
import { getModelKey } from "@/constants/storage";
import type { SendMessageOptions } from "@/types/ipc";
import type { UIMode } from "@/types/mode";
import type { ThinkingLevel } from "@/types/thinking";
import { getSendOptionsFromStorage } from "@/utils/messages/sendOptions";

/**
 * Construct SendMessageOptions from raw values
 * Shared logic for both hook and non-hook versions
 */
function constructSendMessageOptions(
  mode: UIMode,
  thinkingLevel: ThinkingLevel,
  preferredModel: string | null | undefined,
  use1M: boolean
): SendMessageOptions {
  const additionalSystemInstructions = mode === "plan" ? PLAN_MODE_INSTRUCTION : undefined;

  // Ensure model is always a valid string (defensive against corrupted localStorage)
  const model =
    typeof preferredModel === "string" && preferredModel ? preferredModel : defaultModel;

  return {
    thinkingLevel,
    model,
    mode: mode === "exec" || mode === "plan" ? mode : "exec", // Only pass exec/plan to backend
    toolPolicy: modeToToolPolicy(mode),
    additionalSystemInstructions,
    providerOptions: {
      anthropic: {
        use1MContext: use1M,
      },
    },
  };
}

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
    getModelKey(workspaceId),
    defaultModel,
    { listener: true } // Listen for changes from ModelSelector and other sources
  );

  return constructSendMessageOptions(mode, thinkingLevel, preferredModel, use1M);
}

/**
 * Build SendMessageOptions outside React using the shared storage reader.
 * Single source of truth with getSendOptionsFromStorage to avoid JSON parsing bugs.
 */
export function buildSendMessageOptions(workspaceId: string): SendMessageOptions {
  return getSendOptionsFromStorage(workspaceId);
}
