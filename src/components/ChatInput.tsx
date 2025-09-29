import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import { ChatInputToast, Toast } from "./ChatInputToast";
import { SendMessageError } from "./SendMessageError";
import { parseAndProcessCommand } from "../utils/commandProcessor";
import { SendMessageError as SendMessageErrorType } from "../types/errors";

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
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [availableCommands] = useState<string[]>([]); // Will be populated in future
  const [toast, setToast] = useState<Toast | null>(null);
  const [sendError, setSendError] = useState<SendMessageErrorType | null>(null);
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

    // Check for special commands
    const command = parseAndProcessCommand(messageText);

    if (command) {
      if (command.type === "providers-set" && onProviderConfig) {
        setIsSending(true);
        setInput(""); // Clear input immediately

        try {
          await onProviderConfig(command.provider, command.keyPath, command.value);
          // Success - show toast
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: `Provider ${command.provider} updated`,
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

      // Handle invalid syntax
      if (command.type === "invalid-syntax") {
        setToast({
          id: Date.now().toString(),
          type: "error",
          message: command.message,
        });
        return;
      }

      // Handle other command types or unknown commands
      if (command.type === "unknown") {
        setToast({
          id: Date.now().toString(),
          type: "error",
          message: `Unknown command: ${command.raw}`,
        });
        return;
      }
    }

    // Handle /clear command
    if (messageText === "/clear") {
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

    // Regular message - send directly via API
    setIsSending(true);

    try {
      const result = await window.api.workspace.sendMessage(workspaceId, messageText);

      if (!result.success) {
        // Show error using SendMessageError component
        setSendError(result.error);
        // Restore input on error so user can try again
        setInput(messageText);
      } else {
        // Success - clear input and errors
        setInput("");
        // Reset textarea height
        if (inputRef.current) {
          inputRef.current.style.height = "36px";
        }
        setSendError(null);
        onMessageSent?.();
      }
    } catch (error) {
      // Handle unexpected errors
      setSendError({
        type: "unknown",
        raw: error instanceof Error ? error.message : "Failed to send message",
      });
      setInput(messageText);
    } finally {
      setIsSending(false);
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
      {sendError && <SendMessageError error={sendError} />}
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
            setInput(e.target.value);
            // Auto-resize textarea
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
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
