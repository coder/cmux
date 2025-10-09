import React, { useState, useRef, useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import type { Toast } from "./ChatInputToast";
import { ChatInputToast, SolutionLabel } from "./ChatInputToast";
import type { ParsedCommand } from "@/utils/slashCommands/types";
import { parseCommand } from "@/utils/slashCommands/parser";
import type { SendMessageError as SendMessageErrorType } from "@/types/errors";
import { usePersistedState, updatePersistedState } from "@/hooks/usePersistedState";
import { useMode } from "@/contexts/ModeContext";
import { ChatToggles } from "./ChatToggles";
import { useSendMessageOptions } from "@/hooks/useSendMessageOptions";
import { getModelKey, getInputKey } from "@/constants/storage";
import { ToggleGroup } from "./ToggleGroup";
import { CUSTOM_EVENTS } from "@/constants/events";
import type { UIMode } from "@/types/mode";
import {
  getSlashCommandSuggestions,
  type SlashSuggestion,
} from "@/utils/slashCommands/suggestions";
import { TooltipWrapper, Tooltip, HelpIndicator } from "./Tooltip";
import { matchesKeybind, formatKeybind, KEYBINDS, isEditableElement } from "@/utils/ui/keybinds";
import { ModelSelector, type ModelSelectorRef } from "./ModelSelector";
import { useModelLRU } from "@/hooks/useModelLRU";
import { VimTextArea } from "./VimTextArea";

import type { ThinkingLevel } from "@/types/thinking";

const InputSection = styled.div`
  position: relative;
  padding: 5px 15px 15px 15px; /* Reduced top padding from 15px to 5px */
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

// Input now rendered by VimTextArea; styles moved there

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
  const [input, setInput] = usePersistedState(getInputKey(workspaceId), "");
  const [isSending, setIsSending] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<SlashSuggestion[]>([]);
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const handleToastDismiss = useCallback(() => {
    setToast(null);
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<ModelSelectorRef>(null);
  const [mode, setMode] = useMode();
  const { recentModels } = useModelLRU();

  // Get current send message options from shared hook (must be at component top level)
  const sendMessageOptions = useSendMessageOptions(workspaceId);
  // Extract model for convenience (don't create separate state - use hook as single source of truth)
  const preferredModel = sendMessageOptions.model;
  // Setter for model - updates localStorage directly so useSendMessageOptions picks it up
  const setPreferredModel = useCallback(
    (model: string) => updatePersistedState(getModelKey(workspaceId), model),
    [workspaceId]
  );

  const focusMessageInput = useCallback(() => {
    const element = inputRef.current;
    if (!element || element.disabled) {
      return;
    }

    element.focus();

    requestAnimationFrame(() => {
      const cursor = element.value.length;
      element.selectionStart = cursor;
      element.selectionEnd = cursor;
      element.style.height = "auto";
      element.style.height = Math.min(element.scrollHeight, 200) + "px";
    });
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      if (matchesKeybind(event, KEYBINDS.FOCUS_INPUT_I)) {
        event.preventDefault();
        focusMessageInput();
        return;
      }

      if (matchesKeybind(event, KEYBINDS.FOCUS_INPUT_A)) {
        event.preventDefault();
        focusMessageInput();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [focusMessageInput]);

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

  // Allow external components (e.g., CommandPalette) to insert text
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string } | undefined;
      if (!detail?.text) return;
      setInput(detail.text);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener(CUSTOM_EVENTS.INSERT_TO_CHAT_INPUT, handler as EventListener);
    return () =>
      window.removeEventListener(CUSTOM_EVENTS.INSERT_TO_CHAT_INPUT, handler as EventListener);
  }, [setInput]);

  // Allow external components to open the Model Selector
  useEffect(() => {
    const handler = () => {
      // Open the inline ModelSelector and let it take focus itself
      modelSelectorRef.current?.open();
    };
    window.addEventListener(CUSTOM_EVENTS.OPEN_MODEL_SELECTOR, handler as EventListener);
    return () =>
      window.removeEventListener(CUSTOM_EVENTS.OPEN_MODEL_SELECTOR, handler as EventListener);
  }, []);

  // Show toast when thinking level is changed via command palette
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string; level: ThinkingLevel }>).detail;
      if (!detail || detail.workspaceId !== workspaceId || !detail.level) {
        return;
      }

      const level = detail.level;
      const levelDescriptions: Record<ThinkingLevel, string> = {
        off: "Off — fastest responses",
        low: "Low — adds light reasoning",
        medium: "Medium — balanced reasoning",
        high: "High — maximum reasoning depth",
      };

      setToast({
        id: Date.now().toString(),
        type: "success",
        message: `Thinking effort set to ${levelDescriptions[level]}`,
      });
    };

    window.addEventListener(CUSTOM_EVENTS.THINKING_LEVEL_TOAST, handler as EventListener);
    return () =>
      window.removeEventListener(CUSTOM_EVENTS.THINKING_LEVEL_TOAST, handler as EventListener);
  }, [workspaceId, setToast]);

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

        // Handle /compact command
        if (parsed.type === "compact") {
          setInput(""); // Clear input immediately
          setIsSending(true);

          try {
            // Construct message asking for summarization
            const targetWords = parsed.maxOutputTokens
              ? Math.round(parsed.maxOutputTokens / 1.3)
              : 2000;
            let compactionMessage = `Summarize this conversation into a compact form for a new Assistant to continue helping the user. Use approximately ${targetWords} words.`;
            if (parsed.instructions) {
              compactionMessage += ` ${parsed.instructions}`;
            }

            // Send message with compact_summary tool required and maxOutputTokens in options
            // Note: Anthropic doesn't support extended thinking with required tool_choice,
            // so disable thinking for Anthropic models during compaction
            const isAnthropic = sendMessageOptions.model.startsWith("anthropic:");
            const result = await window.api.workspace.sendMessage(workspaceId, compactionMessage, {
              thinkingLevel: isAnthropic ? "off" : sendMessageOptions.thinkingLevel,
              model: sendMessageOptions.model,
              toolPolicy: [{ regex_match: "compact_summary", action: "require" }],
              maxOutputTokens: parsed.maxOutputTokens, // Pass to model directly
            });

            if (!result.success) {
              console.error("Failed to initiate compaction:", result.error);
              setToast(createErrorToast(result.error));
              setInput(messageText); // Restore input on error
            } else {
              setToast({
                id: Date.now().toString(),
                type: "success",
                message: "Compaction started. AI will summarize the conversation.",
              });
              // Note: Full compaction flow needs to be implemented in AIView component:
              // 1. Listen for tool-call-end event with toolName === "compact_summary"
              // 2. Extract summary from tool result
              // 3. Construct CmuxMessage with metadata: { compacted: true, timestamp, model, etc. }
              // 4. Call window.api.workspace.replaceChatHistory(workspaceId, summaryMessage)
            }
          } catch (error) {
            console.error("Compaction error:", error);
            setToast({
              id: Date.now().toString(),
              type: "error",
              message: error instanceof Error ? error.message : "Failed to start compaction",
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
        const result = await window.api.workspace.sendMessage(workspaceId, messageText, {
          ...sendMessageOptions,
          editMessageId: editingMessage?.id,
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
    // Handle open model selector
    if (matchesKeybind(e, KEYBINDS.OPEN_MODEL_SELECTOR)) {
      e.preventDefault();
      modelSelectorRef.current?.open();
      return;
    }

    // Handle cancel edit (Ctrl+Q)
    if (matchesKeybind(e, KEYBINDS.CANCEL_EDIT)) {
      if (editingMessage && onCancelEdit) {
        e.preventDefault();
        onCancelEdit();
        const isFocused = document.activeElement === inputRef.current;
        if (isFocused) {
          inputRef.current?.blur();
        }
        return;
      }
    }

    // Handle escape - let VimTextArea handle it (for Vim mode transitions)
    // Edit canceling is handled by Ctrl+Q above
    // Stream interruption is handled by Ctrl+C (INTERRUPT_STREAM keybind)
    if (matchesKeybind(e, KEYBINDS.CANCEL)) {
      // Do not preventDefault here: allow VimTextArea or other handlers (like suggestions) to process ESC
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

  // Build placeholder text based on current state
  const placeholder = (() => {
    if (editingMessage) {
      return `Edit your message... (${formatKeybind(KEYBINDS.CANCEL)} to cancel edit, ${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send)`;
    }
    if (isCompacting) {
      return "Compacting conversation...";
    }

    // Build hints for normal input
    const hints: string[] = [];
    if (canInterrupt) {
      hints.push(`${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to interrupt`);
    }
    hints.push(`${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send`);
    hints.push(`${formatKeybind(KEYBINDS.OPEN_MODEL_SELECTOR)} to change model`);

    return `Type a message... (${hints.join(", ")})`;
  })();

  return (
    <InputSection data-component="ChatInputSection">
      <ChatInputToast toast={toast} onDismiss={handleToastDismiss} />
      <CommandSuggestions
        suggestions={commandSuggestions}
        onSelectSuggestion={handleCommandSelect}
        onDismiss={() => setShowCommandSuggestions(false)}
        isVisible={showCommandSuggestions}
      />
      <InputControls data-component="ChatInputControls">
        <VimTextArea
          ref={inputRef}
          value={input}
          isEditing={!!editingMessage}
          mode={mode}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          suppressKeys={showCommandSuggestions ? COMMAND_SUGGESTION_KEYS : undefined}
          placeholder={placeholder}
          disabled={disabled || isSending || isCompacting}
        />
      </InputControls>
      <ModeToggles data-component="ChatModeToggles">
        {editingMessage && (
          <EditingIndicator>
            Editing message ({formatKeybind(KEYBINDS.CANCEL_EDIT)} to cancel)
          </EditingIndicator>
        )}
        <ModeTogglesRow>
          <ChatToggles modelString={preferredModel}>
            <ModelDisplayWrapper>
              <ModelSelector
                ref={modelSelectorRef}
                value={preferredModel}
                onChange={setPreferredModel}
                recentModels={recentModels}
                onComplete={() => inputRef.current?.focus()}
              />
              <TooltipWrapper inline>
                <HelpIndicator>?</HelpIndicator>
                <Tooltip className="tooltip" align="left" width="wide">
                  <strong>Click to edit</strong> or use{" "}
                  {formatKeybind(KEYBINDS.OPEN_MODEL_SELECTOR)}
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
          </ChatToggles>
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
