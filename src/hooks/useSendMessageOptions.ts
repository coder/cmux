import { use1MContext } from "./use1MContext";
import { useThinkingLevel } from "./useThinkingLevel";
import { useMode } from "@/contexts/ModeContext";
import { usePersistedState } from "./usePersistedState";
import { modeToToolPolicy, PLAN_MODE_INSTRUCTION } from "@/utils/ui/modeUtils";
import { defaultModel } from "@/utils/ai/models";
import {
  getModelKey,
  getThinkingLevelKey,
  getModeKey,
  USE_1M_CONTEXT_KEY,
} from "@/constants/storage";
import type { SendMessageOptions } from "@/types/ipc";
import type { UIMode } from "@/types/mode";
import type { ThinkingLevel } from "@/types/thinking";

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
 * Build SendMessageOptions from localStorage (non-hook version)
 *
 * CRITICAL: Frontend is responsible for managing ALL sendMessage options.
 * Backend does NOT fall back to workspace metadata - all options must be passed explicitly.
 *
 * This function mirrors useSendMessageOptions logic but reads from localStorage directly,
 * allowing it to be called outside React component lifecycle (e.g., in callbacks).
 */
export function buildSendMessageOptions(workspaceId: string): SendMessageOptions {
  // Read from localStorage matching the keys used by useSendMessageOptions
  const use1M = localStorage.getItem(USE_1M_CONTEXT_KEY) === "true";
  const thinkingLevel =
    (localStorage.getItem(getThinkingLevelKey(workspaceId)) as ThinkingLevel) || "medium";
  const mode = (localStorage.getItem(getModeKey(workspaceId)) as UIMode) || "edit";
  const preferredModel = localStorage.getItem(getModelKey(workspaceId));

  return constructSendMessageOptions(mode, thinkingLevel, preferredModel, use1M);
}
