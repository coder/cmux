import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { UIMode } from "@/types/mode";
import * as vim from "@/utils/vim";

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
`;

type VimMode = vim.VimMode;

export const VimTextArea = React.forwardRef<HTMLTextAreaElement, VimTextAreaProps>(
  ({ value, onChange, mode, isEditing, suppressKeys, onKeyDown, ...rest }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    // Expose DOM ref to parent
    useEffect(() => {
      if (!ref) return;
      if (typeof ref === "function") ref(textareaRef.current as HTMLTextAreaElement);
      else
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = textareaRef.current;
    }, [ref]);

    const [vimMode, setVimMode] = useState<VimMode>("insert");
    const [desiredColumn, setDesiredColumn] = useState<number | null>(null);
    const yankBufferRef = useRef<string>("");
    const pendingOpRef = useRef<null | { op: "d" | "y" | "c"; at: number; args?: string[] }>(null);

    // Auto-resize when value changes
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const max = 200;
      el.style.height = Math.min(el.scrollHeight, max) + "px";
    }, [value]);

    const suppressSet = useMemo(() => new Set(suppressKeys ?? []), [suppressKeys]);

    const withSelection = () => {
      const el = textareaRef.current!;
      return { start: el.selectionStart, end: el.selectionEnd };
    };

    const setCursor = (pos: number) => {
      const el = textareaRef.current!;
      const p = Math.max(0, Math.min(value.length, pos));
      const lineEnd = vim.lineEndAtIndex(value, p);
      el.selectionStart = p;
      // In normal mode, show a 1-char selection (block cursor effect) when possible
      if (vimMode === "normal" && p < lineEnd) {
        el.selectionEnd = p + 1;
      } else {
        el.selectionEnd = p;
      }
      setDesiredColumn(null);
    };

    const moveVert = (delta: number) => {
      const { start } = withSelection();
      const result = vim.moveVertical(value, start, delta, desiredColumn);
      setCursor(result.cursor);
      setDesiredColumn(result.desiredColumn);
    };

    const moveWordForward = () => {
      const newPos = vim.moveWordForward(value, withSelection().end);
      setCursor(newPos);
    };

    const moveWordBackward = () => {
      const newPos = vim.moveWordBackward(value, withSelection().start);
      setCursor(newPos);
    };

    const applyEdit = (result: { text: string; cursor: number; yankBuffer?: string }) => {
      onChange(result.text);
      if (result.yankBuffer !== undefined) {
        yankBufferRef.current = result.yankBuffer;
      }
      setTimeout(() => setCursor(result.cursor), 0);
    };

    const applyEditAndEnterInsert = (result: { text: string; cursor: number; yankBuffer: string }) => {
      onChange(result.text);
      yankBufferRef.current = result.yankBuffer;
      setTimeout(() => {
        setCursor(result.cursor);
        setVimMode("insert");
      }, 0);
    };

    const deleteCharUnderCursor = () => {
      const result = vim.deleteCharUnderCursor(value, withSelection().start, yankBufferRef.current);
      applyEdit(result);
    };

    const deleteLine = () => {
      const result = vim.deleteLine(value, withSelection().start, yankBufferRef.current);
      applyEdit(result);
    };

    const yankLine = () => {
      yankBufferRef.current = vim.yankLine(value, withSelection().start);
    };

    const pasteAfter = () => {
      const result = vim.pasteAfter(value, withSelection().start, yankBufferRef.current);
      applyEdit(result);
    };

    const pasteBefore = () => {
      const result = vim.pasteBefore(value, withSelection().start, yankBufferRef.current);
      applyEdit(result);
    };

    const handleUndo = () => {
      // Use browser's editing history (supported in Chromium)
      // eslint-disable-next-line deprecation/deprecation
      document.execCommand("undo");
    };

    const handleRedo = () => {
      // eslint-disable-next-line deprecation/deprecation
      document.execCommand("redo");
    };

    const handleNormalKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const key = e.key;

      // Multi-key ops: dd / yy / cc / cw / ciw / c$ / C
      const now = Date.now();
      const pending = pendingOpRef.current;
      if (pending && now - pending.at > 800) {
        pendingOpRef.current = null; // timeout
      }

      // Handle continuation of a pending 'c' operator
      if (pending && pending.op === "c") {
        e.preventDefault();
        const args = pending.args ?? [];
        const cursor = withSelection().start;
        // Second char after 'c'
        if (args.length === 0) {
          if (key === "c") {
            // cc: change entire line
            pendingOpRef.current = null;
            const result = vim.changeLine(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
            return;
          }
          if (key === "w") {
            // cw: change to next word boundary
            pendingOpRef.current = null;
            const result = vim.changeWord(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
            return;
          }
          if (key === "$" || key === "End") {
            // c$ : change to end of line
            pendingOpRef.current = null;
            const result = vim.changeToEndOfLine(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
            return;
          }
          if (key === "0" || key === "Home") {
            // c0 : change to beginning of line
            pendingOpRef.current = null;
            const result = vim.changeToBeginningOfLine(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
            return;
          }
          if (key === "i") {
            // Wait for a text object (e.g., w)
            pendingOpRef.current = { op: "c", at: now, args: ["i"] };
            return;
          }
          // Unknown motion: cancel
          pendingOpRef.current = null;
          return;
        }
        // Third key (after 'ci')
        if (args.length === 1 && args[0] === "i") {
          if (key === "w") {
            // ciw: change inner word
            pendingOpRef.current = null;
            const result = vim.changeInnerWord(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
            return;
          }
          // Unhandled text object -> cancel
          pendingOpRef.current = null;
          return;
        }
      }

      switch (key) {
        case "Escape":
          e.preventDefault();
          // stay in normal
          return;
        case "[":
          if (e.ctrlKey) {
            e.preventDefault();
            return;
          }
          break;
        case "i": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "i");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "a": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "a");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "I": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "I");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "A": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "A");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "o": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "o");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "O": {
          e.preventDefault();
          const result = vim.getInsertCursorPos(value, withSelection().start, "O");
          onChange(result.text);
          setTimeout(() => {
            setCursor(result.cursor);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "h":
          e.preventDefault();
          setCursor(withSelection().start - 1);
          return;
        case "l":
          e.preventDefault();
          setCursor(withSelection().start + 1);
          return;
        case "j":
          e.preventDefault();
          moveVert(1);
          return;
        case "k":
          e.preventDefault();
          moveVert(-1);
          return;
        case "0":
          e.preventDefault();
          setCursor(lineBoundsAtCursor().lineStart);
          return;
        case "$":
          e.preventDefault();
          setCursor(lineBoundsAtCursor().lineEnd);
          return;
        case "w":
          e.preventDefault();
          moveWordForward();
          return;
        case "b":
          e.preventDefault();
          moveWordBackward();
          return;
        case "x":
          e.preventDefault();
          deleteCharUnderCursor();
          return;
        case "d": {
          e.preventDefault();
          if (pending && pending.op === "d") {
            pendingOpRef.current = null;
            deleteLine();
          } else {
            pendingOpRef.current = { op: "d", at: now };
          }
          return;
        }
        case "c": {
          e.preventDefault();
          // Start a change operator pending state
          pendingOpRef.current = { op: "c", at: now, args: [] };
          return;
        }
        case "C": {
          e.preventDefault();
          const { lineEnd } = lineBoundsAtCursor();
          const start = withSelection().start;
          changeRange(start, lineEnd);
          return;
        }
        case "y": {
          e.preventDefault();
          if (pending && pending.op === "y") {
            pendingOpRef.current = null;
            yankLine();
          } else {
            pendingOpRef.current = { op: "y", at: now };
          }
          return;
        }
        case "p":
          e.preventDefault();
          pasteAfter();
          return;
        case "P":
          e.preventDefault();
          pasteBefore();
          return;
        case "u":
          e.preventDefault();
          handleUndo();
          return;
        case "r":
          if (e.ctrlKey) {
            e.preventDefault();
            handleRedo();
            return;
          }
          break;
      }

      // If we reached here in normal mode, swallow single-character inputs (don't type letters)
      if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        return;
      }
    };

    const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let parent handle first (send, cancel, etc.)
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      // If suggestions or external popovers are active, do not intercept navigation keys
      if (suppressSet.has(e.key)) return;

      if (vimMode === "insert") {
        // ESC or Ctrl-[ -> normal
        if (e.key === "Escape" || (e.key === "[" && e.ctrlKey)) {
          e.preventDefault();
          setVimMode("normal");
          // In normal mode, update the visual block cursor immediately
          setTimeout(() => setCursor(withSelection().start), 0);
          return;
        }
        // Otherwise, allow browser default typing behavior
        return;
      }

      // Normal mode handling
      handleNormalKey(e);
    };

    return (
      <div style={{ position: "relative", width: "100%" }}>
        <StyledTextArea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDownInternal}
          isEditing={isEditing}
          mode={mode}
          vimMode={vimMode}
          spellCheck={false}
          {...rest}
        />
        {vimMode === "normal" && (
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 10,
              letterSpacing: 0.5,
              color: "#d4d4d4",
              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            NORMAL
          </div>
        )}
      </div>
    );
  }
);

VimTextArea.displayName = "VimTextArea";
