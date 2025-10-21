import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { UIMode } from "@/types/mode";
import * as vim from "@/utils/vim";
import { TooltipWrapper, Tooltip, HelpIndicator } from "./Tooltip";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

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

const StyledTextArea = styled.textarea<{
  isEditing?: boolean;
  mode: UIMode;
  vimMode: VimMode;
}>`
  width: 100%;
  background: ${(props) => (props.isEditing ? "var(--color-editing-mode-alpha)" : "#1e1e1e")};
  border: 1px solid ${(props) => (props.isEditing ? "var(--color-editing-mode)" : "#3e3e42")};
  color: #d4d4d4;
  padding: 6px 8px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  resize: none;
  min-height: 32px;
  max-height: 50vh;
  overflow-y: auto;
  caret-color: ${(props) => (props.vimMode === "normal" ? "transparent" : "#ffffff")};

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

  /* Solid block cursor in normal mode (no blinking) */
  &::selection {
    background-color: ${(props) =>
      props.vimMode === "normal" ? "rgba(255, 255, 255, 0.5)" : "rgba(51, 153, 255, 0.5)"};
  }
`;

const ModeIndicator = styled.div`
  font-size: 9px;
  color: rgba(212, 212, 212, 0.6);
  letter-spacing: 0.8px;
  user-select: none;
  height: 11px; /* Fixed height to prevent border bump */
  line-height: 11px;
  margin-bottom: 1px; /* Minimal spacing between indicator and textarea */
  display: flex;
  align-items: center;
  justify-content: space-between; /* Space between left (vim mode) and right (focus hint) */
  gap: 4px;
`;

const ModeLeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ModeRightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
`;

const ModeText = styled.span`
  text-transform: uppercase; /* Only uppercase the mode name, not commands */
`;

const EmptyCursor = styled.div`
  position: absolute;
  width: 8px;
  height: 16px;
  background-color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  left: 8px;
  top: 6px;
`;

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
        <ModeIndicator aria-live="polite">
          <ModeLeftSection>
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
                <ModeText>normal</ModeText>
                {pendingCommand && <span>{pendingCommand}</span>}
              </>
            )}
          </ModeLeftSection>
          {showFocusHint && (
            <ModeRightSection>
              <span>{formatKeybind(KEYBINDS.FOCUS_CHAT)} to focus</span>
            </ModeRightSection>
          )}
        </ModeIndicator>
        <div style={{ position: "relative" }} data-component="VimTextAreaWrapper">
          <StyledTextArea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDownInternal}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            isEditing={isEditing}
            mode={mode}
            vimMode={vimMode}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
            autoComplete="off"
            {...rest}
          />
          {vimMode === "normal" && value.length === 0 && <EmptyCursor />}
        </div>
      </div>
    );
  }
);

VimTextArea.displayName = "VimTextArea";
