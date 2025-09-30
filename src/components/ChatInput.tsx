import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import { ChatInputToast, Toast, SolutionLabel } from "./ChatInputToast";
import { parseCommand, ParsedCommand } from "../utils/commandParser";
import { SendMessageError as SendMessageErrorType } from "../types/errors";
import { usePersistedState } from "../hooks/usePersistedState";

const InputSection = styled.div`
  position: relative;
  padding: 15px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InputControls = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
`;

const InputField = styled.textarea`
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  color: #d4d4d4;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  resize: none;
  min-height: 36px;
  max-height: 200px;
  overflow-y: auto;
  max-height: 120px;

  &:focus {
    outline: none;
    border-color: #569cd6;
  }

  &::placeholder {
    color: #6b6b6b;
  }
`;

const SendButton = styled.button`
  background: #0e639c;
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    background: #1177bb;
  }

  &:disabled {
    background: #3e3e42;
    cursor: not-allowed;
    color: #6b6b6b;
  }
`;

const ModeToggles = styled.div`
  display: flex;
  align-items: center;
`;

const DebugModeToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #606060;
  cursor: pointer;
  user-select: none;
  opacity: 0.7;
  transition: opacity 0.2s ease;

  input {
    cursor: pointer;
    transform: scale(0.9);
  }

  &:hover {
    opacity: 1;
  }
`;

export interface ChatInputProps {
  workspaceId: string;
  onMessageSent?: () => void; // Optional callback after successful send
  onClearHistory: () => Promise<void>;
  onProviderConfig?: (provider: string, keyPath: string[], value: string) => Promise<void>;
  debugMode: boolean;
  onDebugModeChange: (enabled: boolean) => void;
  disabled?: boolean;
  isCompacting?: boolean;
}

// Helper function to convert parsed command to display toast
const createCommandToast = (parsed: ParsedCommand): Toast | null => {
  if (!parsed) return null;

  switch (parsed.type) {
    case "providers-help":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Providers Command",
        message: "Configure AI provider settings",
        solution: (
          <>
            <SolutionLabel>Usage:</SolutionLabel>
            /providers set &lt;provider&gt; &lt;key&gt; &lt;value&gt;
            <br />
            <br />
            <SolutionLabel>Example:</SolutionLabel>
            /providers set anthropic apiKey YOUR_API_KEY
          </>
        ),
      };

    case "providers-missing-args": {
      const missing =
        parsed.argCount === 0
          ? "provider, key, and value"
          : parsed.argCount === 1
            ? "key and value"
            : parsed.argCount === 2
              ? "value"
              : "";

      return {
        id: Date.now().toString(),
        type: "error",
        title: "Missing Arguments",
        message: `Missing ${missing} for /providers set`,
        solution: (
          <>
            <SolutionLabel>Usage:</SolutionLabel>
            /providers set &lt;provider&gt; &lt;key&gt; &lt;value&gt;
          </>
        ),
      };
    }

    case "providers-invalid-subcommand":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Invalid Subcommand",
        message: `Invalid subcommand '${parsed.subcommand}'`,
        solution: (
          <>
            <SolutionLabel>Available Commands:</SolutionLabel>
            /providers set - Configure provider settings
          </>
        ),
      };

    case "unknown-command": {
      const cmd = "/" + parsed.command + (parsed.subcommand ? " " + parsed.subcommand : "");
      return {
        id: Date.now().toString(),
        type: "error",
        message: `Unknown command: ${cmd}`,
      };
    }

    default:
      return null;
  }
};

// Helper function to convert SendMessageError to Toast
const createErrorToast = (error: SendMessageErrorType): Toast => {
  switch (error.type) {
    case "api_key_not_found":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "API Key Not Found",
        message: `The ${error.provider} provider requires an API key to function.`,
        solution: (
          <>
            <SolutionLabel>Quick Fix:</SolutionLabel>
            /providers set {error.provider} apiKey YOUR_API_KEY
          </>
        ),
      };

    case "provider_not_configured":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Provider Not Configured",
        message: `The ${error.provider} provider needs to be configured before use.`,
        solution: (
          <>
            <SolutionLabel>Configure Provider:</SolutionLabel>
            /providers set {error.provider} apiKey YOUR_API_KEY
          </>
        ),
      };

    case "invalid_model_string":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Invalid Model Format",
        message: error.message,
        solution: (
          <>
            <SolutionLabel>Expected Format:</SolutionLabel>
            provider:model-name (e.g., anthropic:claude-opus-4-1)
          </>
        ),
      };

    case "unknown":
    default:
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Message Send Failed",
        message: error.raw || "An unexpected error occurred while sending your message.",
      };
  }
};

export const ChatInput: React.FC<ChatInputProps> = ({
  workspaceId,
  onMessageSent,
  onClearHistory,
  onProviderConfig,
  debugMode,
  onDebugModeChange,
  disabled = false,
  isCompacting = false,
}) => {
  const [input, setInput] = usePersistedState("input:" + workspaceId, "");
  const [isSending, setIsSending] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [availableCommands] = useState<string[]>([]); // Will be populated in future
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Watch input for slash commands
  useEffect(() => {
    setShowCommandSuggestions(input.startsWith("/") && availableCommands.length > 0);
  }, [input, availableCommands]);

  // Handle command selection
  const handleCommandSelect = useCallback((command: string) => {
    setInput(`/${command} `);
    setShowCommandSuggestions(false);
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || disabled || isSending || isCompacting) return;

    const messageText = input.trim();

    try {
      // Parse command
      const parsed = parseCommand(messageText);

      if (parsed) {
        // Handle /clear command
        if (parsed.type === "clear") {
          setInput("");
          if (inputRef.current) {
            inputRef.current.style.height = "36px";
          }
          await onClearHistory();
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: "Chat history cleared",
          });
          return;
        }

        // Handle /providers set command
        if (parsed.type === "providers-set" && onProviderConfig) {
          setIsSending(true);
          setInput(""); // Clear input immediately

          try {
            await onProviderConfig(parsed.provider, parsed.keyPath, parsed.value);
            // Success - show toast
            setToast({
              id: Date.now().toString(),
              type: "success",
              message: `Provider ${parsed.provider} updated`,
            });
          } catch (error) {
            setToast({
              id: Date.now().toString(),
              type: "error",
              message: error instanceof Error ? error.message : "Failed to update provider",
            });
            setInput(messageText); // Restore input on error
          } finally {
            setIsSending(false);
          }
          return;
        }

        // Handle all other commands - show display toast
        const commandToast = createCommandToast(parsed);
        if (commandToast) {
          setToast(commandToast);
          return;
        }
      }

      // Regular message - send directly via API
      setIsSending(true);

      try {
        const result = await window.api.workspace.sendMessage(workspaceId, messageText);

        if (!result.success) {
          // Show error using enhanced toast
          setToast(createErrorToast(result.error));
          // Restore input on error so user can try again
          setInput(messageText);
        } else {
          // Success - clear input
          setInput("");
          // Reset textarea height
          if (inputRef.current) {
            inputRef.current.style.height = "36px";
          }
          onMessageSent?.();
        }
      } catch (error) {
        // Handle unexpected errors
        setToast(
          createErrorToast({
            type: "unknown",
            raw: error instanceof Error ? error.message : "Failed to send message",
          })
        );
        setInput(messageText);
      } finally {
        setIsSending(false);
      }
    } finally {
      // Always restore focus at the end
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle keys if command suggestions are visible
    if (showCommandSuggestions && COMMAND_SUGGESTION_KEYS.includes(e.key)) {
      return; // Let CommandSuggestions handle it
    }

    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter: allow newline (default behavior)
        return;
      } else {
        // Enter: send message
        e.preventDefault();
        handleSend();
      }
    }
  };

  return (
    <InputSection>
      <ChatInputToast toast={toast} onDismiss={() => setToast(null)} />
      <CommandSuggestions
        input={input}
        availableCommands={availableCommands}
        onSelectCommand={handleCommandSelect}
        onDismiss={() => setShowCommandSuggestions(false)}
        isVisible={showCommandSuggestions}
      />
      <InputControls>
        <InputField
          ref={inputRef}
          value={input}
          onChange={(e) => {
            const newValue = e.target.value;
            setInput(newValue);
            // Auto-resize textarea
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";

            // Don't clear toast when typing - let user dismiss it manually or it auto-dismisses
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isCompacting ? "Compacting conversation..." : "Type a message... (Enter to send)"
          }
          disabled={disabled || isSending || isCompacting}
        />
        <SendButton
          onClick={handleSend}
          disabled={!input.trim() || disabled || isSending || isCompacting}
        >
          {isCompacting ? "Compacting..." : isSending ? "Sending..." : "Send"}
        </SendButton>
      </InputControls>
      <ModeToggles>
        <DebugModeToggle>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => onDebugModeChange(e.target.checked)}
          />
          Debug Mode
        </DebugModeToggle>
      </ModeToggles>
    </InputSection>
  );
};
