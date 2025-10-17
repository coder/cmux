import { useEffect } from "react";
import type { Keybind } from "@/types/keybinds";
import type { ChatInputAPI } from "@/components/ChatInput";

interface UseFKeyBindsParams {
  keybinds: Keybind[];
  chatInputAPI: React.RefObject<ChatInputAPI | null>;
  enabled: boolean; // Disable when modal is open
}

/**
 * Hook to handle F1-F10 key presses and trigger keybind actions
 *
 * When an F-key is pressed, looks up the keybind and sends the message
 * through ChatInputAPI to ensure proper command parsing and validation.
 */
export function useFKeyBinds({ keybinds, chatInputAPI, enabled }: UseFKeyBindsParams): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if it's an F1-F10 key
      if (!e.key.match(/^F([1-9]|10)$/)) {
        return;
      }

      // Find matching keybind
      const keybind = keybinds.find((kb) => kb.key === e.key);
      if (!keybind) {
        return;
      }

      // Only handle send_message actions for now
      if (keybind.action.type === "send_message" && keybind.action.message) {
        e.preventDefault();

        // Send through ChatInputAPI to get command parsing, validation, etc.
        const message = keybind.action.message;
        chatInputAPI.current?.sendMessage(message);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keybinds, chatInputAPI, enabled]);
}

