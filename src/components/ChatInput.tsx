import React, {
  Suspense,
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useDeferredValue,
} from "react";
import { cn } from "@/lib/utils";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import type { Toast } from "./ChatInputToast";
import { ChatInputToast } from "./ChatInputToast";
import { createCommandToast, createErrorToast } from "./ChatInputToasts";
import { parseCommand } from "@/utils/slashCommands/parser";
import { usePersistedState, updatePersistedState } from "@/hooks/usePersistedState";
import { useMode } from "@/contexts/ModeContext";
import { ThinkingSliderComponent } from "./ThinkingSlider";
import { Context1MCheckbox } from "./Context1MCheckbox";
import { useSendMessageOptions } from "@/hooks/useSendMessageOptions";
import { getModelKey, getInputKey, VIM_ENABLED_KEY } from "@/constants/storage";
import {
  handleNewCommand,
  handleCompactCommand,
  forkWorkspace,
  prepareCompactionMessage,
  type CommandHandlerContext,
} from "@/utils/chatCommands";
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
import {
  extractImagesFromClipboard,
  extractImagesFromDrop,
  processImageFiles,
} from "@/utils/imageHandling";

import type { ThinkingLevel } from "@/types/thinking";
import type { CmuxFrontendMetadata } from "@/types/message";
import { useTelemetry } from "@/hooks/useTelemetry";
import { setTelemetryEnabled } from "@/telemetry";
import { getTokenCountPromise } from "@/utils/tokenizer/rendererClient";

type TokenCountReader = () => number;

function createTokenCountResource(promise: Promise<number>): TokenCountReader {
  let status: "pending" | "success" | "error" = "pending";
  let value = 0;
  let error: Error | null = null;

  const suspender = promise.then(
    (resolved) => {
      status = "success";
      value = resolved;
    },
    (reason: unknown) => {
      status = "error";
      error = reason instanceof Error ? reason : new Error(String(reason));
    }
  );

  return () => {
    if (status === "pending") {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw suspender;
    }
    if (status === "error") {
      throw error ?? new Error("Unknown tokenizer error");
    }
    return value;
  };
}

export interface ChatInputAPI {
  focus: () => void;
  restoreText: (text: string) => void;
  appendText: (text: string) => void;
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
  const [vimEnabled, setVimEnabled] = usePersistedState<boolean>(VIM_ENABLED_KEY, false, {
    listener: true,
  });

  // Get current send message options from shared hook (must be at component top level)
  const sendMessageOptions = useSendMessageOptions(workspaceId);
  // Extract model for convenience (don't create separate state - use hook as single source of truth)
  const preferredModel = sendMessageOptions.model;
  const deferredModel = useDeferredValue(preferredModel);
  const deferredInput = useDeferredValue(input);
  const tokenCountPromise = useMemo(() => {
    if (!deferredModel || deferredInput.trim().length === 0 || deferredInput.startsWith("/")) {
      return Promise.resolve(0);
    }
    return getTokenCountPromise(deferredModel, deferredInput);
  }, [deferredModel, deferredInput]);
  const tokenCountReader = useMemo(
    () => createTokenCountResource(tokenCountPromise),
    [tokenCountPromise]
  );
  const hasTypedText = input.trim().length > 0;
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

  // Method to restore text to input (used by compaction cancel)
  const restoreText = useCallback(
    (text: string) => {
      setInput(() => text);
      focusMessageInput();
    },
    [focusMessageInput, setInput]
  );

  // Method to append text to input (used by Code Review notes)
  const appendText = useCallback(
    (text: string) => {
      setInput((prev) => {
        // Add blank line before if there's existing content
        const separator = prev.trim() ? "\n\n" : "";
        return prev + separator + text;
      });
      // Don't focus - user wants to keep reviewing
    },
    [setInput]
  );

  // Provide API to parent via callback
  useEffect(() => {
    if (onReady) {
      onReady({
        focus: focusMessageInput,
        restoreText,
        appendText,
      });
    }
  }, [onReady, focusMessageInput, restoreText, appendText]);

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

    const imageFiles = extractImagesFromClipboard(items);
    if (imageFiles.length === 0) return;

    e.preventDefault(); // Prevent default paste behavior for images

    void processImageFiles(imageFiles).then((attachments) => {
      setImageAttachments((prev) => [...prev, ...attachments]);
    });
  }, []);

  // Handle removing an image attachment
  const handleRemoveImage = useCallback((id: string) => {
    setImageAttachments((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Handle drag over to allow drop
  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    // Check if drag contains files
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  // Handle drop to extract images
  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();

    const imageFiles = extractImagesFromDrop(e.dataTransfer);
    if (imageFiles.length === 0) return;

    void processImageFiles(imageFiles).then((attachments) => {
      setImageAttachments((prev) => [...prev, ...attachments]);
    });
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

        // Handle /vim command
        if (parsed.type === "vim-toggle") {
          setInput(""); // Clear input immediately
          setVimEnabled((prev) => !prev);
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
          const context: CommandHandlerContext = {
            workspaceId,
            sendMessageOptions,
            editMessageId: editingMessage?.id,
            setInput,
            setIsSending,
            setToast,
            onCancelEdit,
          };

          const result = await handleCompactCommand(parsed, context);
          if (!result.clearInput) {
            setInput(messageText); // Restore input on error
          }
          return;
        }

        // Handle /fork command
        if (parsed.type === "fork") {
          setInput(""); // Clear input immediately
          setIsSending(true);

          try {
            const forkResult = await forkWorkspace({
              sourceWorkspaceId: workspaceId,
              newName: parsed.newName,
              startMessage: parsed.startMessage,
              sendMessageOptions,
            });

            if (!forkResult.success) {
              const errorMsg = forkResult.error ?? "Failed to fork workspace";
              console.error("Failed to fork workspace:", errorMsg);
              setToast({
                id: Date.now().toString(),
                type: "error",
                title: "Fork Failed",
                message: errorMsg,
              });
              setInput(messageText); // Restore input on error
            } else {
              setToast({
                id: Date.now().toString(),
                type: "success",
                message: `Forked to workspace "${parsed.newName}"`,
              });
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Failed to fork workspace";
            console.error("Fork error:", error);
            setToast({
              id: Date.now().toString(),
              type: "error",
              title: "Fork Failed",
              message: errorMsg,
            });
            setInput(messageText); // Restore input on error
          }

          setIsSending(false);
          return;
        }

        // Handle /new command
        if (parsed.type === "new") {
          const context: CommandHandlerContext = {
            workspaceId,
            sendMessageOptions,
            setInput,
            setIsSending,
            setToast,
          };

          const result = await handleNewCommand(parsed, context);
          if (!result.clearInput) {
            setInput(messageText); // Restore input on error
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

      // Save current state for restoration on error
      const previousImageAttachments = [...imageAttachments];

      try {
        // Prepare image parts if any
        const imageParts = imageAttachments.map((img, index) => {
          // Validate before sending to help with debugging
          if (!img.url || typeof img.url !== "string") {
            console.error(
              `Image attachment [${index}] has invalid url:`,
              typeof img.url,
              img.url?.slice(0, 50)
            );
          }
          if (!img.url?.startsWith("data:")) {
            console.error(
              `Image attachment [${index}] url is not a data URL:`,
              img.url?.slice(0, 100)
            );
          }
          if (!img.mediaType || typeof img.mediaType !== "string") {
            console.error(
              `Image attachment [${index}] has invalid mediaType:`,
              typeof img.mediaType,
              img.mediaType
            );
          }
          return {
            url: img.url,
            mediaType: img.mediaType,
          };
        });

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
              sendOptions,
            } = prepareCompactionMessage({
              workspaceId,
              maxOutputTokens: parsed.maxOutputTokens,
              continueMessage: parsed.continueMessage,
              model: parsed.model,
              sendMessageOptions,
            });
            actualMessageText = regeneratedText;
            cmuxMetadata = metadata;
            compactionOptions = sendOptions;
          }
        }

        // Clear input and images immediately for responsive UI
        // These will be restored if the send operation fails
        setInput("");
        setImageAttachments([]);
        // Reset textarea height
        if (inputRef.current) {
          inputRef.current.style.height = "36px";
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
          // Restore input and images on error so user can try again
          setInput(messageText);
          setImageAttachments(previousImageAttachments);
        } else {
          // Track telemetry for successful message send
          telemetry.messageSent(sendMessageOptions.model, mode, actualMessageText.length);

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
        setImageAttachments(previousImageAttachments);
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
      return `Compacting... (${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} cancel | ${formatKeybind(KEYBINDS.ACCEPT_EARLY_COMPACTION)} accept early)`;
    }

    // Build hints for normal input
    const hints: string[] = [];
    if (canInterrupt) {
      hints.push(`${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to interrupt`);
    }
    hints.push(`${formatKeybind(KEYBINDS.SEND_MESSAGE)} to send`);
    hints.push(`${formatKeybind(KEYBINDS.OPEN_MODEL_SELECTOR)} to change model`);
    hints.push(`/vim to toggle Vim mode (${vimEnabled ? "on" : "off"})`);

    return `Type a message... (${hints.join(", ")})`;
  })();

  return (
    <div
      className="bg-separator border-border-light relative flex flex-col gap-1 border-t px-[15px] pt-[5px] pb-[15px]"
      data-component="ChatInputSection"
    >
      <ChatInputToast toast={toast} onDismiss={handleToastDismiss} />
      <CommandSuggestions
        suggestions={commandSuggestions}
        onSelectSuggestion={handleCommandSelect}
        onDismiss={() => setShowCommandSuggestions(false)}
        isVisible={showCommandSuggestions}
        ariaLabel="Slash command suggestions"
        listId={commandListId}
      />
      <div className="flex items-end gap-2.5" data-component="ChatInputControls">
        <VimTextArea
          ref={inputRef}
          value={input}
          isEditing={!!editingMessage}
          mode={mode}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
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
      </div>
      <ImageAttachments images={imageAttachments} onRemove={handleRemoveImage} />
      <div className="flex flex-col gap-1" data-component="ChatModeToggles">
        {editingMessage && (
          <div className="text-edit-mode text-[11px] font-medium">
            Editing message ({formatKeybind(KEYBINDS.CANCEL_EDIT)} to cancel)
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Model Selector - always visible */}
          <div className="flex items-center" data-component="ModelSelectorGroup">
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
                <strong>Click to edit</strong> or use {formatKeybind(KEYBINDS.OPEN_MODEL_SELECTOR)}
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
          </div>

          {/* Thinking Slider - hide on small viewports */}
          <div
            className="flex items-center max-[550px]:hidden"
            data-component="ThinkingSliderGroup"
          >
            <ThinkingSliderComponent modelString={preferredModel} />
          </div>

          {/* Context 1M Checkbox - hide on smaller viewports */}
          <div className="flex items-center max-[450px]:hidden" data-component="Context1MGroup">
            <Context1MCheckbox modelString={preferredModel} />
          </div>
          {preferredModel && (
            <div className={hasTypedText ? "block" : "hidden"}>
              <Suspense
                fallback={
                  <div
                    className="text-muted flex items-center gap-1 text-xs"
                    data-component="TokenEstimate"
                  >
                    <span>Calculating tokens…</span>
                  </div>
                }
              >
                <TokenCountDisplay reader={tokenCountReader} />
              </Suspense>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 max-[550px]:hidden">
            <div
              className={cn(
                "flex gap-0 bg-toggle-bg rounded",
                "[&>button:first-of-type]:rounded-l [&>button:last-of-type]:rounded-r",
                mode === "exec" &&
                  "[&>button:first-of-type]:bg-exec-mode [&>button:first-of-type]:text-white [&>button:first-of-type]:hover:bg-exec-mode-hover",
                mode === "plan" &&
                  "[&>button:last-of-type]:bg-plan-mode [&>button:last-of-type]:text-white [&>button:last-of-type]:hover:bg-plan-mode-hover"
              )}
            >
              <ToggleGroup<UIMode>
                options={[
                  { value: "exec", label: "Exec", activeClassName: "bg-exec-mode text-white" },
                  { value: "plan", label: "Plan", activeClassName: "bg-plan-mode text-white" },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

const TokenCountDisplay: React.FC<{ reader: TokenCountReader }> = ({ reader }) => {
  const tokens = reader();
  if (!tokens) {
    return null;
  }
  return (
    <div className="text-muted flex items-center gap-1 text-xs" data-component="TokenEstimate">
      <span>{tokens.toLocaleString()} tokens</span>
    </div>
  );
};
