import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import type { Toast } from "./ChatInputToast";
import { ChatInputToast, SolutionLabel } from "./ChatInputToast";
import type { ParsedCommand } from "@/utils/slashCommands/types";
import { parseCommand } from "@/utils/slashCommands/parser";
import type { SendMessageError as SendMessageErrorType } from "@/types/errors";
import { usePersistedState } from "@/hooks/usePersistedState";
import { ThinkingSliderComponent } from "./ThinkingSlider";
import { useThinkingLevel } from "@/hooks/useThinkingLevel";
import { useMode } from "@/contexts/ModeContext";
import { modeToToolPolicy } from "@/utils/ui/modeUtils";
import { ToggleGroup } from "./ToggleGroup";
import type { UIMode } from "@/types/mode";
import {
  getSlashCommandSuggestions,
  type SlashSuggestion,
} from "@/utils/slashCommands/suggestions";
import { TooltipWrapper, Tooltip, HelpIndicator } from "./Tooltip";
import { matchesKeybind, formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { defaultModel } from "@/utils/ai/models";

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

const InputField = styled.textarea<{
  isEditing?: boolean;
  canInterrupt?: boolean;
  mode: UIMode;
}>`
  flex: 1;
  background: ${(props) => (props.isEditing ? "var(--color-editing-mode-alpha)" : "#1e1e1e")};
  border: 1px solid ${(props) => (props.isEditing ? "var(--color-editing-mode)" : "#3e3e42")};
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
    border-color: ${(props) =>
      props.isEditing
        ? "var(--color-editing-mode)"
        : props.mode === "plan"
          ? "var(--color-plan-mode)"
          : "var(--color-exec-mode)"};
  }

  &::placeholder {
    color: #6b6b6b;
  }
`;

const ModeToggles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ModeTogglesRow = styled.div`
  display: flex;
  align-items: center;
`;

const ModeToggleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
`;

const StyledToggleContainer = styled.div<{ mode: UIMode }>`
  display: flex;
  gap: 0;
  background: var(--color-toggle-bg);
  border-radius: 4px;

  button {
    &:first-of-type {
      ${(props) =>
        props.mode === "exec" &&
        `
        background: var(--color-exec-mode);
        color: white;

        &:hover {
          background: var(--color-exec-mode-hover);
        }
      `}
    }

    &:last-of-type {
      ${(props) =>
        props.mode === "plan" &&
        `
        background: var(--color-plan-mode);
        color: white;

        &:hover {
          background: var(--color-plan-mode-hover);
        }
      `}
    }
  }
`;

const EditingIndicator = styled.div`
  font-size: 11px;
  color: var(--color-editing-mode);
  font-weight: 500;
`;

const ModelDisplay = styled.div`
  font-size: 10px;
  color: #808080;
  font-family: var(--font-monospace);
  line-height: 11px;
`;

const ModelDisplayWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 12px;
  height: 11px;
`;

export interface ChatInputProps {
  workspaceId: string;
  onMessageSent?: () => void; // Optional callback after successful send
  onTruncateHistory: (percentage?: number) => Promise<void>;
  onProviderConfig?: (provider: string, keyPath: string[], value: string) => Promise<void>;
  onModelChange?: (model: string) => void;
  disabled?: boolean;
  isCompacting?: boolean;
  editingMessage?: { id: string; content: string };
  onCancelEdit?: () => void;
  canInterrupt?: boolean; // Whether Esc can be used to interrupt streaming
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

    case "model-help":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Model Command",
        message: "Select AI model for this session",
        solution: (
          <>
            <SolutionLabel>Usage:</SolutionLabel>
            /model &lt;abbreviation&gt; or /model &lt;provider:model&gt;
            <br />
            <br />
            <SolutionLabel>Examples:</SolutionLabel>
            /model sonnet
            <br />
            /model anthropic:opus-4-1
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

    case "provider_not_supported":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Provider Not Supported",
        message: `The ${error.provider} provider is not supported yet.`,
        solution: (
          <>
            <SolutionLabel>Try This:</SolutionLabel>
            Use an available provider from /providers list
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
  onTruncateHistory,
  onProviderConfig,
  onModelChange,
  disabled = false,
  isCompacting = false,
  editingMessage,
  onCancelEdit,
  canInterrupt = false,
}) => {
  const [input, setInput] = usePersistedState("input:" + workspaceId, "");
  const [preferredModel, setPreferredModel] = usePersistedState<string>(
    "cmux-preferred-model",
    defaultModel
  );
  const [isSending, setIsSending] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<SlashSuggestion[]>([]);
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [thinkingLevel] = useThinkingLevel();
  const [mode, setMode] = useMode();

  // When entering editing mode, populate input with message content
  useEffect(() => {
    if (editingMessage) {
      setInput(editingMessage.content);
      // Auto-resize textarea and focus
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + "px";
          inputRef.current.focus();
        }
      }, 0);
    }
  }, [editingMessage, setInput]);

  // Watch input for slash commands
  useEffect(() => {
    const suggestions = getSlashCommandSuggestions(input, { providerNames });
    setCommandSuggestions(suggestions);
    setShowCommandSuggestions(suggestions.length > 0);
  }, [input, providerNames]);

  // Load provider names for suggestions
  useEffect(() => {
    let isMounted = true;

    const loadProviders = async () => {
      try {
        const names = await window.api.providers.list();
        if (isMounted && Array.isArray(names)) {
          setProviderNames(names);
        }
      } catch (error) {
        console.error("Failed to load provider list:", error);
      }
    };

    void loadProviders();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle command selection
  const handleCommandSelect = useCallback(
    (suggestion: SlashSuggestion) => {
      setInput(suggestion.replacement);
      setShowCommandSuggestions(false);
      inputRef.current?.focus();
    },
    [setInput]
  );

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
          await onTruncateHistory(1.0);
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: "Chat history cleared",
          });
          return;
        }

        // Handle /truncate command
        if (parsed.type === "truncate") {
          setInput("");
          if (inputRef.current) {
            inputRef.current.style.height = "36px";
          }
          await onTruncateHistory(parsed.percentage);
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: `Chat history truncated by ${Math.round(parsed.percentage * 100)}%`,
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
            console.error("Failed to update provider config:", error);
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

        // Handle /model command
        if (parsed.type === "model-set") {
          setInput(""); // Clear input immediately
          setPreferredModel(parsed.modelString);
          onModelChange?.(parsed.modelString);
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: `Model changed to ${parsed.modelString}`,
          });
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
        const result = await window.api.workspace.sendMessage(workspaceId, messageText, {
          editMessageId: editingMessage?.id,
          thinkingLevel,
          model: preferredModel,
          toolPolicy: modeToToolPolicy(mode),
        });

        if (!result.success) {
          // Log error for debugging
          console.error("Failed to send message:", result.error);
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
          // Exit editing mode if we were editing
          if (editingMessage && onCancelEdit) {
            onCancelEdit();
          }
          onMessageSent?.();
        }
      } catch (error) {
        // Handle unexpected errors
        console.error("Unexpected error sending message:", error);
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
    // Handle cancel/escape
    if (matchesKeybind(e, KEYBINDS.CANCEL)) {
      e.preventDefault();

      // Priority 1: Cancel editing if in edit mode
      if (editingMessage && onCancelEdit) {
        onCancelEdit();
        return;
      }

      // Priority 2: Interrupt streaming if active
      if (canInterrupt) {
        // Send empty message to trigger interrupt
        void window.api.workspace.sendMessage(workspaceId, "");
        return;
      }

      return;
    }

    // Don't handle keys if command suggestions are visible
    if (
      showCommandSuggestions &&
      commandSuggestions.length > 0 &&
      COMMAND_SUGGESTION_KEYS.includes(e.key)
    ) {
      return; // Let CommandSuggestions handle it
    }

    // Handle newline
    if (matchesKeybind(e, KEYBINDS.NEW_LINE)) {
      // Allow newline (default behavior)
      return;
    }

    // Handle send message
    if (matchesKeybind(e, KEYBINDS.SEND_MESSAGE)) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <InputSection>
      <ChatInputToast toast={toast} onDismiss={() => setToast(null)} />
      <CommandSuggestions
        suggestions={commandSuggestions}
        onSelectSuggestion={handleCommandSelect}
        onDismiss={() => setShowCommandSuggestions(false)}
        isVisible={showCommandSuggestions}
      />
      <InputControls>
        <InputField
          ref={inputRef}
          value={input}
          isEditing={!!editingMessage}
          mode={mode}
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
            editingMessage
              ? `Edit your message... (${formatKeybind(KEYBINDS.CANCEL)} to cancel, ${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send)`
              : isCompacting
                ? "Compacting conversation..."
                : canInterrupt
                  ? `Type a message... (${formatKeybind(KEYBINDS.CANCEL)} to interrupt, ${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send, ${formatKeybind(KEYBINDS.NEW_LINE)} for newline)`
                  : `Type a message... (${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send, ${formatKeybind(KEYBINDS.NEW_LINE)} for newline)`
          }
          disabled={disabled || isSending || isCompacting}
          canInterrupt={canInterrupt}
        />
      </InputControls>
      <ModeToggles>
        {editingMessage && <EditingIndicator>Editing message (ESC to cancel)</EditingIndicator>}
        <ModeTogglesRow>
          <ModelDisplayWrapper>
            <ModelDisplay>{preferredModel}</ModelDisplay>
            <TooltipWrapper inline>
              <HelpIndicator>?</HelpIndicator>
              <Tooltip className="tooltip" align="left" width="wide">
                Change model using <code>/model</code> command
                <br />
                <br />
                <strong>Abbreviations:</strong>
                <br />• <code>/model opus</code> - Claude Opus 4.1
                <br />• <code>/model sonnet</code> - Claude Sonnet 4.5
                <br />
                <br />
                <strong>Full format:</strong>
                <br />
                <code>/model provider:model-name</code>
                <br />
                (e.g., <code>/model anthropic:claude-sonnet-4-5</code>)
              </Tooltip>
            </TooltipWrapper>
          </ModelDisplayWrapper>
          <ThinkingSliderComponent />
          <ModeToggleWrapper>
            <StyledToggleContainer mode={mode}>
              <ToggleGroup<UIMode>
                options={[
                  { value: "exec", label: "Exec" },
                  { value: "plan", label: "Plan" },
                ]}
                value={mode}
                onChange={setMode}
              />
            </StyledToggleContainer>
            <TooltipWrapper inline>
              <HelpIndicator>?</HelpIndicator>
              <Tooltip className="tooltip" align="center" width="wide">
                <strong>Exec Mode:</strong> AI edits files and execute commands
                <br />
                <br />
                <strong>Plan Mode:</strong> AI proposes plans but does not edit files
                <br />
                <br />
                Toggle with: {formatKeybind(KEYBINDS.TOGGLE_MODE)}
              </Tooltip>
            </TooltipWrapper>
          </ModeToggleWrapper>
        </ModeTogglesRow>
      </ModeToggles>
    </InputSection>
  );
};
