import React, { useState, useRef, useCallback, useEffect } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import { RUNTIME_MODE } from "@/types/runtime";
import { parseRuntimeString } from "@/utils/chatCommands";
import { getModelKey } from "@/constants/storage";
import { useModelLRU } from "@/hooks/useModelLRU";
import { useNewWorkspaceOptions } from "@/hooks/useNewWorkspaceOptions";
import { ModelSelector } from "./ModelSelector";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { VimTextArea } from "./VimTextArea";

interface FirstMessageInputProps {
  projectPath: string;
  projectName: string;
  onWorkspaceCreated: (metadata: FrontendWorkspaceMetadata) => void;
  onCancel?: () => void;
}

/**
 * FirstMessageInput - Simplified input for sending first message without a workspace
 *
 * When user sends a message, it:
 * 1. Creates a workspace with AI-generated title/branch
 * 2. Sends the message to the new workspace
 * 3. Switches to the new workspace (via callback)
 */
export function FirstMessageInput({
  projectPath,
  projectName,
  onWorkspaceCreated,
  onCancel,
}: FirstMessageInputProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [trunkBranch, setTrunkBranch] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get most recent model from LRU (project-scoped preference)
  const { recentModels, addModel } = useModelLRU();
  const projectModelKey = getModelKey(`__project__${projectPath}`);
  const preferredModel = localStorage.getItem(projectModelKey) ?? recentModels[0];

  // Setter for model
  const setPreferredModel = useCallback(
    (model: string) => {
      addModel(model);
      localStorage.setItem(projectModelKey, model);
    },
    [projectModelKey, addModel]
  );

  // Runtime configuration (Local vs SSH)
  const [runtimeOptions, setRuntimeOptions] = useNewWorkspaceOptions(projectPath);
  const { runtimeMode, sshHost, getRuntimeString } = runtimeOptions;

  // Load branches on mount
  useEffect(() => {
    async function loadBranches() {
      try {
        const result = await window.api.projects.listBranches(projectPath);
        const sanitizedBranches = Array.isArray(result?.branches)
          ? result.branches.filter((branch): branch is string => typeof branch === "string")
          : [];
        setBranches(sanitizedBranches);

        // Set default trunk branch
        const recommended =
          typeof result?.recommendedTrunk === "string" &&
          sanitizedBranches.includes(result.recommendedTrunk)
            ? result.recommendedTrunk
            : (sanitizedBranches[0] ?? "main");
        setTrunkBranch(recommended);
      } catch (err) {
        console.error("Failed to load branches:", err);
        setTrunkBranch("main"); // Fallback
      }
    }
    void loadBranches();
  }, [projectPath]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      // Get runtime config from options
      const runtimeString = getRuntimeString();
      const runtimeConfig: RuntimeConfig | undefined = runtimeString
        ? parseRuntimeString(runtimeString, "")
        : undefined;

      const result = await window.api.workspace.sendMessage(null, input, {
        model: preferredModel,
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
  }, [input, isSending, projectPath, preferredModel, onWorkspaceCreated, getRuntimeString]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Send on Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSend();
      }
      // Cancel on Escape
      if (e.key === "Escape" && onCancel) {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSend, onCancel]
  );

  return (
    <div className="flex flex-1 h-full flex-col">
      {/* Project title in center */}
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-foreground mb-2 text-2xl font-semibold">{projectName}</h1>
          <p className="text-muted text-sm">
            {branches.length > 0 && trunkBranch && <>Based on {trunkBranch}</>}
          </p>
        </div>
      </div>

      {/* Input area - styled like ChatInput */}
      <div
        className="bg-separator border-border-light relative flex flex-col gap-1 border-t px-[15px] pt-[5px] pb-[15px]"
        data-component="FirstMessageInputSection"
      >
        {/* Error toast */}
        {error && (
          <div className="mb-2 rounded border border-red-700 bg-red-900/20 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Text input */}
        <div className="flex items-end gap-2.5" data-component="FirstMessageInputControls">
          <VimTextArea
            ref={inputRef}
            value={input}
            isEditing={false}
            mode="exec"
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onPaste={undefined}
            onDragOver={undefined}
            onDrop={undefined}
            suppressKeys={undefined}
            placeholder="Type your first message to create a workspace..."
            disabled={isSending}
            aria-label="First message"
          />
        </div>

        {/* Options row - Model + Runtime */}
        <div className="@container flex flex-col gap-1" data-component="FirstMessageOptions">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Model Selector */}
            <div className="flex items-center" data-component="ModelSelectorGroup">
              <ModelSelector
                value={preferredModel}
                onChange={setPreferredModel}
                recentModels={recentModels}
                onComplete={() => inputRef.current?.focus()}
              />
            </div>

            {/* Runtime Selector */}
            <div className="flex items-center gap-1" data-component="RuntimeSelectorGroup">
              <select
                value={runtimeMode}
                onChange={(e) => {
                  const newMode = e.target.value as
                    | typeof RUNTIME_MODE.LOCAL
                    | typeof RUNTIME_MODE.SSH;
                  setRuntimeOptions(newMode, newMode === RUNTIME_MODE.LOCAL ? "" : sshHost);
                }}
                disabled={isSending}
                className="bg-separator text-foreground border-border-medium focus:border-accent rounded border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
              >
                <option value={RUNTIME_MODE.LOCAL}>Local</option>
                <option value={RUNTIME_MODE.SSH}>SSH Remote</option>
              </select>
              {runtimeMode === RUNTIME_MODE.SSH && (
                <input
                  type="text"
                  value={sshHost}
                  onChange={(e) => setRuntimeOptions(RUNTIME_MODE.SSH, e.target.value)}
                  placeholder="user@host"
                  disabled={isSending}
                  className="bg-separator text-foreground border-border-medium focus:border-accent w-32 rounded border px-2 py-1 text-xs focus:outline-none disabled:opacity-50"
                />
              )}
              <TooltipWrapper inline>
                <span className="text-muted cursor-help text-xs">?</span>
                <Tooltip className="tooltip" align="center" width="wide">
                  <strong>Runtime:</strong>
                  <br />
                  • Local: git worktree in ~/.cmux/src
                  <br />• SSH: remote clone in ~/cmux on SSH host
                </Tooltip>
              </TooltipWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
