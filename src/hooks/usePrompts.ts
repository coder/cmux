import { useState, useEffect, useCallback } from "react";
import {
  getPromptSuggestions,
  extractPromptMentions,
  expandPromptMentions,
  type PromptSuggestion,
} from "@/utils/promptSuggestions";

interface UsePromptsOptions {
  workspaceId: string;
  input: string;
  cursorPos?: number;
}

interface UsePromptsReturn {
  availablePrompts: Array<{ name: string; path: string; location: "repo" | "system" }>;
  suggestions: PromptSuggestion[];
  showSuggestions: boolean;
  dismissSuggestions: () => void;
  expandMentions: (text: string) => Promise<string>;
}

/**
 * Hook for managing prompt mentions in chat input
 *
 * Handles:
 * - Loading available prompts from workspace
 * - Generating suggestions based on input
 * - Expanding @mentions to their content
 */
export function usePrompts({ workspaceId, input, cursorPos }: UsePromptsOptions): UsePromptsReturn {
  const [availablePrompts, setAvailablePrompts] = useState<
    Array<{ name: string; path: string; location: "repo" | "system" }>
  >([]);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [manuallyDismissed, setManuallyDismissed] = useState(false);

  // Load available prompts for the workspace
  useEffect(() => {
    let isMounted = true;

    const loadPrompts = async () => {
      try {
        const prompts = await window.api.prompts.list(workspaceId);
        if (isMounted && Array.isArray(prompts)) {
          setAvailablePrompts(prompts);
        }
      } catch (error) {
        console.error("Failed to load prompts:", error);
      }
    };

    void loadPrompts();

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  // Generate suggestions based on input
  useEffect(() => {
    const pos = cursorPos ?? input.length;
    const newSuggestions = getPromptSuggestions(input, pos, availablePrompts);
    setSuggestions(newSuggestions);
    setShowSuggestions(newSuggestions.length > 0 && !manuallyDismissed);

    // Reset manual dismissal when input changes
    if (manuallyDismissed) {
      setManuallyDismissed(false);
    }
  }, [input, cursorPos, availablePrompts, manuallyDismissed]);

  // Expand @mentions in text to their actual content
  const expandMentions = useCallback(
    async (text: string): Promise<string> => {
      const mentions = extractPromptMentions(text);
      if (mentions.length === 0) {
        return text;
      }

      const promptContents = new Map<string, string>();
      for (const mention of mentions) {
        try {
          const content = await window.api.prompts.read(workspaceId, mention);
          if (content) {
            promptContents.set(mention, content);
          }
        } catch (error) {
          console.error(`Failed to read prompt "${mention}":`, error);
        }
      }

      return expandPromptMentions(text, promptContents);
    },
    [workspaceId]
  );

  const dismissSuggestions = useCallback(() => {
    setManuallyDismissed(true);
    setShowSuggestions(false);
  }, []);

  return {
    availablePrompts,
    suggestions,
    showSuggestions,
    dismissSuggestions,
    expandMentions,
  };
}
