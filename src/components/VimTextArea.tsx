import React, { useEffect, useMemo, useRef, useState } from "react";
import type { UIMode } from "@/types/mode";
import * as vim from "@/utils/vim";
import { TooltipWrapper, Tooltip, HelpIndicator } from "./Tooltip";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { cn } from "@/lib/utils";

/**
 * VimTextArea – minimal Vim-like editing for a textarea.
 *
 * MVP goals:
 * - Modes: insert (default) and normal
 * - ESC / Ctrl-[ to enter normal mode; i/a/I/A/o/O to enter insert (with placement)
 * - Navigation: h/j/k/l, 0, $, w, b
 * - Edit: x (delete char), dd (delete line), yy (yank line), p/P (paste), u (undo), Ctrl-r (redo)
 * - Works alongside parent keybinds (send, cancel). Parent onKeyDown runs first; if it prevents default we do nothing.
 * - Respects a suppressKeys list (e.g. when command suggestions popover is open)
 *
 * Keep in sync with:
 * - docs/vim-mode.md (user documentation)
 * - src/utils/vim.ts (core Vim logic)
 * - src/utils/vim.test.ts (integration tests)
 */

export interface VimTextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
  mode: UIMode; // for styling (plan/exec focus color)
  isEditing?: boolean;
  suppressKeys?: string[]; // keys for which Vim should not interfere (e.g. ["Tab","ArrowUp","ArrowDown","Escape"]) when popovers are open
}

type VimMode = vim.VimMode;

export const VimTextArea = React.forwardRef<HTMLTextAreaElement, VimTextAreaProps>(
  ({ value, onChange, mode, isEditing, suppressKeys, onKeyDown, ...rest }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    // Expose DOM ref to parent
    useEffect(() => {
      if (!ref) return;
      if (typeof ref === "function") ref(textareaRef.current);
      else ref.current = textareaRef.current;
    }, [ref]);

    const [vimMode, setVimMode] = useState<VimMode>("insert");
    const [isFocused, setIsFocused] = useState(false);
    const [desiredColumn, setDesiredColumn] = useState<number | null>(null);
    const [pendingOp, setPendingOp] = useState<null | {
      op: "d" | "y" | "c";
      at: number;
      args?: string[];
    }>(null);
    const yankBufferRef = useRef<string>("");

    // Auto-resize when value changes
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const max = window.innerHeight * 0.5; // 50vh
      el.style.height = Math.min(el.scrollHeight, max) + "px";
    }, [value]);

    const suppressSet = useMemo(() => new Set(suppressKeys ?? []), [suppressKeys]);

    const withSelection = () => {
      const el = textareaRef.current!;
      return { start: el.selectionStart, end: el.selectionEnd };
    };

    const setCursor = (pos: number, mode?: vim.VimMode) => {
      const el = textareaRef.current!;
      const p = Math.max(0, Math.min(value.length, pos));
      el.selectionStart = p;
      // In normal mode, show a 1-char selection (block cursor effect) when possible
      // Show cursor if there's a character under it (including at end of line before newline)
      const effectiveMode = mode ?? vimMode;
      if (effectiveMode === "normal" && p < value.length) {
        el.selectionEnd = p + 1;
      } else {
        el.selectionEnd = p;
      }
      setDesiredColumn(null);
    };

    const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let parent handle first (send, cancel, etc.)
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      // If suggestions or external popovers are active, do not intercept navigation keys
      if (suppressSet.has(e.key)) return;

      // Build current Vim state
      const vimState: vim.VimState = {
        text: value,
        cursor: withSelection().start,
        mode: vimMode,
        yankBuffer: yankBufferRef.current,
        desiredColumn,
        pendingOp,
      };

      // Handle key press through centralized state machine
      const result = vim.handleKeyPress(vimState, e.key, {
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
      });

      if (!result.handled) return; // Let browser handle (e.g., typing in insert mode)

      e.preventDefault();

      // Handle side effects (undo/redo)
      if (result.action === "undo") {
        document.execCommand("undo");
        return;
      }
      if (result.action === "redo") {
        document.execCommand("redo");
        return;
      }

      // Apply new state to React
      const newState = result.newState;

      if (newState.text !== value) {
        onChange(newState.text);
      }
      if (newState.mode !== vimMode) {
        setVimMode(newState.mode);
      }
      if (newState.yankBuffer !== yankBufferRef.current) {
        yankBufferRef.current = newState.yankBuffer;
      }
      if (newState.desiredColumn !== desiredColumn) {
        setDesiredColumn(newState.desiredColumn);
      }
      if (newState.pendingOp !== pendingOp) {
        setPendingOp(newState.pendingOp);
      }

      // Set cursor after React state updates (important for mode transitions)
      // Pass the new mode explicitly to avoid stale closure issues
      setTimeout(() => setCursor(newState.cursor, newState.mode), 0);
    };

    // Build mode indicator content
    const showVimMode = vimMode === "normal";
    const pendingCommand = showVimMode ? vim.formatPendingCommand(pendingOp) : "";
    const showFocusHint = !isFocused;

    return (
      <div style={{ width: "100%" }} data-component="VimTextAreaContainer">
        <div
          className="text-[9px] text-[rgba(212,212,212,0.6)] tracking-[0.8px] select-none h-[11px] leading-[11px] mb-px flex items-center justify-between gap-1"
          aria-live="polite"
        >
          <div className="flex items-center gap-1">
            {showVimMode && (
              <>
                <TooltipWrapper>
                  <HelpIndicator>?</HelpIndicator>
                  <Tooltip align="left" width="wide">
                    <strong>Vim Mode Enabled</strong>
                    <br />
                    <br />
                    Press <strong>ESC</strong> for normal mode, <strong>i</strong> to return to
                    insert mode.
                    <br />
                    <br />
                    See{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.open("/docs/vim-mode.md");
                      }}
                    >
                      Vim Mode docs
                    </a>{" "}
                    for full command reference.
                  </Tooltip>
                </TooltipWrapper>
                <span className="uppercase">normal</span>
                {pendingCommand && <span>{pendingCommand}</span>}
              </>
            )}
          </div>
          {showFocusHint && (
            <div className="flex items-center gap-1 ml-auto">
              <span>{formatKeybind(KEYBINDS.FOCUS_CHAT)} to focus</span>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }} data-component="VimTextAreaWrapper">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDownInternal}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            autoComplete="off"
            {...rest}
            className={cn(
              "w-full border text-[#d4d4d4] py-1.5 px-2 rounded font-inherit text-[13px] resize-none min-h-8 max-h-[50vh] overflow-y-auto",
              "placeholder:text-[#6b6b6b]",
              "focus:outline-none",
              isEditing
                ? "bg-[var(--color-editing-mode-alpha)] border-[var(--color-editing-mode)] focus:border-[var(--color-editing-mode)]"
                : "bg-[#1e1e1e] border-[#3e3e42]",
              !isEditing && (mode === "plan" ? "focus:border-plan-mode" : "focus:border-exec-mode"),
              vimMode === "normal"
                ? "caret-transparent selection:bg-white/50"
                : "caret-white selection:bg-[rgba(51,153,255,0.5)]"
            )}
          />
          {vimMode === "normal" && value.length === 0 && (
            <div className="absolute w-2 h-4 bg-white/50 pointer-events-none left-2 top-1.5" />
          )}
        </div>
      </div>
    );
  }
);

VimTextArea.displayName = "VimTextArea";
