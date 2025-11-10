import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import { parseRuntimeString } from "@/utils/chatCommands";
import { getRuntimeKey } from "@/constants/storage";
import { useSendMessageOptions } from "@/hooks/useSendMessageOptions";

interface FirstMessageInputProps {
  projectPath: string;
  onWorkspaceCreated: (metadata: FrontendWorkspaceMetadata) => void;
}

/**
 * FirstMessageInput - Simplified input for sending first message without a workspace
 *
 * When user sends a message, it:
 * 1. Creates a workspace with AI-generated title/branch
 * 2. Sends the message to the new workspace
 * 3. Switches to the new workspace (via callback)
 */
export function FirstMessageInput({ projectPath, onWorkspaceCreated }: FirstMessageInputProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Use standard send message options (project-scoped, not workspace-specific)
  const sendMessageOptions = useSendMessageOptions(`__project__${projectPath}`);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      // Read runtime preference from localStorage
      const runtimeKey = getRuntimeKey(projectPath);
      const runtimeString = localStorage.getItem(runtimeKey);
      const runtimeConfig: RuntimeConfig | undefined = runtimeString
        ? parseRuntimeString(runtimeString, "")
        : undefined;

      const result = await window.api.workspace.sendMessage(null, input, {
        ...sendMessageOptions,
        runtimeConfig,
        projectPath, // Pass projectPath when workspaceId is null
      });

      if (!result.success) {
        const errorMsg =
          typeof result.error === "string"
            ? result.error
            : "raw" in result.error
              ? result.error.raw
              : result.error.type;
        setError(errorMsg);
        setIsSending(false);
        return;
      }

      // Check if this is a workspace creation result (has metadata field)
      if ("metadata" in result && result.metadata) {
        // Clear input
        setInput("");

        // Notify parent to switch workspace
        onWorkspaceCreated(result.metadata);
      } else {
        // This shouldn't happen for null workspaceId, but handle gracefully
        setError("Unexpected response from server");
        setIsSending(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create workspace: ${errorMessage}`);
      setIsSending(false);
    }
  }, [input, isSending, projectPath, sendMessageOptions, onWorkspaceCreated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Send on Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Spacer to push input to bottom */}
      <div className="flex-1" />

      {/* Input area */}
      <div className="border-t border-gray-700 p-4">
        {error && (
          <div className="mb-3 rounded border border-red-700 bg-red-900/20 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <textarea
            ref={inputRef}
            className={cn(
              "w-full resize-none rounded border bg-gray-800 px-3 py-2 text-white",
              "border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              "placeholder-gray-500",
              "min-h-[80px] max-h-[300px]"
            )}
            placeholder="Type your first message to create a workspace..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {window.api.platform === "darwin" ? "⌘" : "Ctrl"}+Enter to send
            </span>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              className={cn(
                "rounded px-4 py-2 text-sm font-medium",
                !input.trim() || isSending
                  ? "cursor-not-allowed bg-gray-700 text-gray-500"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isSending ? "Creating..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
