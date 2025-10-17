import React, { useState, useRef, useCallback, useEffect, useId } from "react";
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
import { ImageAttachments, type ImageAttachment } from "./ImageAttachments";

import type { ThinkingLevel } from "@/types/thinking";
import type { CmuxFrontendMetadata, CompactionRequestData } from "@/types/message";
import type { SendMessageOptions } from "@/types/ipc";
import { applyCompactionOverrides } from "@/utils/messages/compactionOptions";
import { useTelemetry } from "@/hooks/useTelemetry";
import { setTelemetryEnabled } from "@/telemetry";

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

export interface ChatInputAPI {
  focus: () => void;
}

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
  onEditLastUserMessage?: () => void;
  canInterrupt?: boolean; // Whether Esc can be used to interrupt streaming
  onReady?: (api: ChatInputAPI) => void; // Callback with focus method
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

    case "telemetry-help":
      return {
        id: Date.now().toString(),
        type: "error",
        title: "Telemetry Command",
        message: "Enable or disable usage telemetry",
        solution: (
          <>
            <SolutionLabel>Usage:</SolutionLabel>
            /telemetry &lt;on|off&gt;
            <br />
            <br />
            <SolutionLabel>Examples:</SolutionLabel>
            /telemetry off
            <br />
            /telemetry on
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

/**
 * Prepare compaction message from /compact command
 * Returns the actual message text (summarization request), metadata, and options
 */
function prepareCompactionMessage(
  command: string,
  sendMessageOptions: SendMessageOptions
): {
  messageText: string;
  metadata: CmuxFrontendMetadata;
  options: Partial<SendMessageOptions>;
} {
  const parsed = parseCommand(command);
  if (parsed?.type !== "compact") {
    throw new Error("Not a compact command");
  }

  const targetWords = parsed.maxOutputTokens ? Math.round(parsed.maxOutputTokens / 1.3) : 2000;

  const messageText = `Summarize this conversation into a compact form for a new Assistant to continue helping the user. Use approximately ${targetWords} words.`;

  // Create compaction metadata (will be stored in user message)
  const compactData: CompactionRequestData = {
    model: parsed.model,
    maxOutputTokens: parsed.maxOutputTokens,
    continueMessage: parsed.continueMessage,
  };

  const metadata: CmuxFrontendMetadata = {
    type: "compaction-request",
    rawCommand: command,
    parsed: compactData,
  };

  // Apply compaction overrides using shared transformation function
  // This same function is used by useResumeManager to ensure consistency
  const options = applyCompactionOverrides(sendMessageOptions, compactData);

  return { messageText, metadata, options };
}

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
  onEditLastUserMessage,
  canInterrupt = false,
  onReady,
}) => {
  const [input, setInput] = usePersistedState(getInputKey(workspaceId), "", { listener: true });
  const [isSending, setIsSending] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<SlashSuggestion[]>([]);
  const [providerNames, setProviderNames] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const handleToastDismiss = useCallback(() => {
    setToast(null);
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelSelectorRef = useRef<ModelSelectorRef>(null);
  const [mode, setMode] = useMode();
  const { recentModels, addModel } = useModelLRU();
  const commandListId = useId();
  const telemetry = useTelemetry();

  // Get current send message options from shared hook (must be at component top level)
  const sendMessageOptions = useSendMessageOptions(workspaceId);
  // Extract model for convenience (don't create separate state - use hook as single source of truth)
  const preferredModel = sendMessageOptions.model;
  // Setter for model - updates localStorage directly so useSendMessageOptions picks it up
  const setPreferredModel = useCallback(
    (model: string) => {
      addModel(model); // Update LRU
      updatePersistedState(getModelKey(workspaceId), model); // Update workspace-specific
    },
    [workspaceId, addModel]
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
      element.style.height = Math.min(element.scrollHeight, window.innerHeight * 0.5) + "px";
    });
  }, []);

  // Provide API to parent via callback
  useEffect(() => {
    if (onReady) {
      onReady({ focus: focusMessageInput });
    }
  }, [onReady, focusMessageInput]);

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
          inputRef.current.style.height =
            Math.min(inputRef.current.scrollHeight, window.innerHeight * 0.5) + "px";
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
      if (detail?.workspaceId !== workspaceId || !detail.level) {
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

  // Auto-focus chat input when workspace changes (e.g., new workspace created or switched)
  useEffect(() => {
    // Small delay to ensure DOM is ready and other components have settled
    const timer = setTimeout(() => {
      focusMessageInput();
    }, 100);
    return () => clearTimeout(timer);
  }, [workspaceId, focusMessageInput]);

  // Handle paste events to extract images
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Look for image items in clipboard
    for (const item of Array.from(items)) {
      if (!item?.type.startsWith("image/")) continue;

      e.preventDefault(); // Prevent default paste behavior for images

      const file = item.getAsFile();
      if (!file) continue;

      // Convert to base64 data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          const attachment: ImageAttachment = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            dataUrl,
            mimeType: file.type,
          };
          setImageAttachments((prev) => [...prev, attachment]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Handle removing an image attachment
  const handleRemoveImage = useCallback((id: string) => {
    setImageAttachments((prev) => prev.filter((img) => img.id !== id));
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
    // Allow sending if there's text or images
    if ((!input.trim() && imageAttachments.length === 0) || disabled || isSending || isCompacting) {
      return;
    }

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

        // Handle /telemetry command
        if (parsed.type === "telemetry-set") {
          setInput(""); // Clear input immediately
          setTelemetryEnabled(parsed.enabled);
          setToast({
            id: Date.now().toString(),
            type: "success",
            message: `Telemetry ${parsed.enabled ? "enabled" : "disabled"}`,
          });
          return;
        }

        // Handle /compact command
        if (parsed.type === "compact") {
          setInput(""); // Clear input immediately
          setIsSending(true);

          try {
            const {
              messageText: compactionMessage,
              metadata,
              options,
            } = prepareCompactionMessage(messageText, sendMessageOptions);

            const result = await window.api.workspace.sendMessage(workspaceId, compactionMessage, {
              ...sendMessageOptions,
              ...options,
              cmuxMetadata: metadata,
              editMessageId: editingMessage?.id, // Support editing compaction messages
            });

            if (!result.success) {
              console.error("Failed to initiate compaction:", result.error);
              setToast(createErrorToast(result.error));
              setInput(messageText); // Restore input on error
            } else {
              setToast({
                id: Date.now().toString(),
                type: "success",
                message:
                  metadata.type === "compaction-request" && metadata.parsed.continueMessage
                    ? "Compaction started. Will continue automatically after completion."
                    : "Compaction started. AI will summarize the conversation.",
              });
              // Clear editing state on success
              if (editingMessage && onCancelEdit) {
                onCancelEdit();
              }
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
        // Prepare image parts if any
        const imageParts = imageAttachments.map((img) => ({
          image: img.dataUrl,
          mimeType: img.mimeType,
        }));

        // When editing a /compact command, regenerate the actual summarization request
        let actualMessageText = messageText;
        let cmuxMetadata: CmuxFrontendMetadata | undefined;
        let compactionOptions = {};

        if (editingMessage && messageText.startsWith("/")) {
          const parsed = parseCommand(messageText);
          if (parsed?.type === "compact") {
            const {
              messageText: regeneratedText,
              metadata,
              options,
            } = prepareCompactionMessage(messageText, sendMessageOptions);
            actualMessageText = regeneratedText;
            cmuxMetadata = metadata;
            compactionOptions = options;
          }
        }

        const result = await window.api.workspace.sendMessage(workspaceId, actualMessageText, {
          ...sendMessageOptions,
          ...compactionOptions,
          editMessageId: editingMessage?.id,
          imageParts: imageParts.length > 0 ? imageParts : undefined,
          cmuxMetadata,
        });

        if (!result.success) {
          // Log error for debugging
          console.error("Failed to send message:", result.error);
          // Show error using enhanced toast
          setToast(createErrorToast(result.error));
          // Restore input on error so user can try again
          setInput(messageText);
        } else {
          // Track telemetry for successful message send
          telemetry.messageSent(sendMessageOptions.model, mode, actualMessageText.length);

          // Success - clear input and images
          setInput("");
          setImageAttachments([]);
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

    // Handle up arrow on empty input - edit last user message
    if (e.key === "ArrowUp" && !editingMessage && input.trim() === "" && onEditLastUserMessage) {
      e.preventDefault();
      onEditLastUserMessage();
      return;
    }

    // Note: ESC handled by VimTextArea (for mode transitions) and CommandSuggestions (for dismissal)
    // Edit canceling is Ctrl+Q, stream interruption is Ctrl+C

    // Don't handle keys if command suggestions are visible
    if (
      showCommandSuggestions &&
      commandSuggestions.length > 0 &&
      COMMAND_SUGGESTION_KEYS.includes(e.key)
    ) {
      return; // Let CommandSuggestions handle it
    }

    // Handle send message (Shift+Enter for newline is default behavior)
    if (matchesKeybind(e, KEYBINDS.SEND_MESSAGE)) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Build placeholder text based on current state
  const placeholder = (() => {
    if (editingMessage) {
      return `Edit your message... (${formatKeybind(KEYBINDS.CANCEL_EDIT)} to cancel, ${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send)`;
    }
    if (isCompacting) {
      return `Compacting... (${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel)`;
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
        ariaLabel="Slash command suggestions"
        listId={commandListId}
      />
      <InputControls data-component="ChatInputControls">
        <VimTextArea
          ref={inputRef}
          value={input}
          isEditing={!!editingMessage}
          mode={mode}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          suppressKeys={showCommandSuggestions ? COMMAND_SUGGESTION_KEYS : undefined}
          placeholder={placeholder}
          disabled={!editingMessage && (disabled || isSending || isCompacting)}
          aria-label={editingMessage ? "Edit your last message" : "Message Claude"}
          aria-autocomplete="list"
          aria-controls={
            showCommandSuggestions && commandSuggestions.length > 0 ? commandListId : undefined
          }
          aria-expanded={showCommandSuggestions && commandSuggestions.length > 0}
        />
      </InputControls>
      <ImageAttachments images={imageAttachments} onRemove={handleRemoveImage} />
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
