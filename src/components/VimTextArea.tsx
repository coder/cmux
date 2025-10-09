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

  /* Solid block cursor in normal mode (no blinking) */
  &::selection {
    background-color: ${(props) =>
      props.vimMode === "normal" ? "rgba(255, 255, 255, 0.5)" : "rgba(51, 153, 255, 0.5)"};
  }
`;

const ModeIndicator = styled.div`
  font-size: 9px;
  color: rgba(212, 212, 212, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  user-select: none;
  height: 11px; /* Fixed height to prevent border bump */
  line-height: 11px;
  margin-bottom: 1px; /* Minimal spacing between indicator and textarea */
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
      else
        (ref).current = textareaRef.current;
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
      el.selectionStart = p;
      // In normal mode, show a 1-char selection (block cursor effect) when possible
      // Show cursor if there's a character under it (including at end of line before newline)
      if (vimMode === "normal" && p < value.length) {
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
        setVimMode("insert"); // Set mode BEFORE cursor to avoid block selection
        setCursor(result.cursor);
      }, 0);
    };

    const deleteCharUnderCursor = () => {
      const result = vim.deleteCharUnderCursor(value, withSelection().start, yankBufferRef.current);
      applyEdit(result);
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
       
      document.execCommand("undo");
    };

    const handleRedo = () => {
       
      document.execCommand("redo");
    };

    // Apply operator with motion
    const applyOperator = (
      op: "d" | "c" | "y",
      motion: "w" | "b" | "$" | "0" | "line",
      cursor: number
    ) => {
      const result = (() => {
        switch (op) {
          case "d":
            switch (motion) {
              case "w":
                return vim.deleteRange(
                  value,
                  cursor,
                  vim.moveWordForward(value, cursor),
                  true,
                  yankBufferRef.current
                );
              case "b":
                return vim.deleteRange(
                  value,
                  vim.moveWordBackward(value, cursor),
                  cursor,
                  true,
                  yankBufferRef.current
                );
              case "$": {
                const { lineEnd } = vim.getLineBounds(value, cursor);
                return vim.deleteRange(value, cursor, lineEnd, true, yankBufferRef.current);
              }
              case "0": {
                const { lineStart } = vim.getLineBounds(value, cursor);
                return vim.deleteRange(value, lineStart, cursor, true, yankBufferRef.current);
              }
              case "line":
                return vim.deleteLine(value, cursor, yankBufferRef.current);
            }
            break;
          case "c":
            switch (motion) {
              case "w":
                return vim.changeWord(value, cursor, yankBufferRef.current);
              case "b":
                return vim.changeRange(
                  value,
                  vim.moveWordBackward(value, cursor),
                  cursor,
                  yankBufferRef.current
                );
              case "$":
                return vim.changeToEndOfLine(value, cursor, yankBufferRef.current);
              case "0":
                return vim.changeToBeginningOfLine(value, cursor, yankBufferRef.current);
              case "line":
                return vim.changeLine(value, cursor, yankBufferRef.current);
            }
            break;
          case "y":
            switch (motion) {
              case "w": {
                const to = vim.moveWordForward(value, cursor);
                const yanked = value.slice(cursor, to);
                return { text: value, cursor, yankBuffer: yanked };
              }
              case "b": {
                const from = vim.moveWordBackward(value, cursor);
                const yanked = value.slice(from, cursor);
                return { text: value, cursor, yankBuffer: yanked };
              }
              case "$": {
                const { lineEnd } = vim.getLineBounds(value, cursor);
                const yanked = value.slice(cursor, lineEnd);
                return { text: value, cursor, yankBuffer: yanked };
              }
              case "0": {
                const { lineStart } = vim.getLineBounds(value, cursor);
                const yanked = value.slice(lineStart, cursor);
                return { text: value, cursor, yankBuffer: yanked };
              }
              case "line":
                return { text: value, cursor, yankBuffer: vim.yankLine(value, cursor) };
            }
            break;
        }
        return null;
      })();

      if (!result) return;

      if (op === "c") {
        applyEditAndEnterInsert(result);
      } else {
        applyEdit(result);
      }
    };

    const handleNormalKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const key = e.key;

      // Operator-motion system
      const now = Date.now();
      const pending = pendingOpRef.current;
      if (pending && now - pending.at > 800) {
        pendingOpRef.current = null; // timeout
      }

      // Handle pending operator + motion
      if (pending && (pending.op === "d" || pending.op === "c" || pending.op === "y")) {
        e.preventDefault();
        const cursor = withSelection().start;
        const args = pending.args ?? [];

        // Handle doubled operator (dd, yy, cc) -> line operation
        if (args.length === 0 && key === pending.op) {
          pendingOpRef.current = null;
          applyOperator(pending.op, "line", cursor);
          return;
        }

        // Handle text objects (currently just "iw")
        if (args.length === 1 && args[0] === "i" && key === "w") {
          pendingOpRef.current = null;
          if (pending.op === "c") {
            const result = vim.changeInnerWord(value, cursor, yankBufferRef.current);
            applyEditAndEnterInsert(result);
          } else if (pending.op === "d") {
            const { start, end } = vim.wordBoundsAt(value, cursor);
            const result = vim.deleteRange(value, start, end, true, yankBufferRef.current);
            applyEdit(result);
          } else if (pending.op === "y") {
            const { start, end } = vim.wordBoundsAt(value, cursor);
            const yanked = value.slice(start, end);
            yankBufferRef.current = yanked;
          }
          return;
        }

        // Handle motion keys
        if (args.length === 0) {
          if (key === "w" || key === "W") {
            pendingOpRef.current = null;
            applyOperator(pending.op, "w", cursor);
            return;
          }
          if (key === "b" || key === "B") {
            pendingOpRef.current = null;
            applyOperator(pending.op, "b", cursor);
            return;
          }
          if (key === "$" || key === "End") {
            pendingOpRef.current = null;
            applyOperator(pending.op, "$", cursor);
            return;
          }
          if (key === "0" || key === "Home") {
            pendingOpRef.current = null;
            applyOperator(pending.op, "0", cursor);
            return;
          }
          if (key === "i") {
            // Wait for text object (e.g., w)
            pendingOpRef.current = { op: pending.op, at: now, args: ["i"] };
            return;
          }
        }

        // Unknown motion: cancel
        pendingOpRef.current = null;
        return;
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
        case "0": {
          e.preventDefault();
          const { lineStart } = vim.getLineBounds(value, withSelection().start);
          setCursor(lineStart);
          return;
        }
        case "$": {
          e.preventDefault();
          const { lineEnd } = vim.getLineBounds(value, withSelection().start);
          // In Vim normal mode, $ goes to the last character, not after it
          setCursor(Math.max(0, lineEnd - 1));
          return;
        }
        case "w":
        case "W":
          e.preventDefault();
          moveWordForward();
          return;
        case "b":
        case "B":
          e.preventDefault();
          moveWordBackward();
          return;
        case "x":
          e.preventDefault();
          deleteCharUnderCursor();
          return;
        case "d": {
          e.preventDefault();
          // Start delete operator pending state
          pendingOpRef.current = { op: "d", at: now, args: [] };
          return;
        }
        case "c": {
          e.preventDefault();
          // Start change operator pending state
          pendingOpRef.current = { op: "c", at: now, args: [] };
          return;
        }
        case "C": {
          e.preventDefault();
          const cursor = withSelection().start;
          const result = vim.changeToEndOfLine(value, cursor, yankBufferRef.current);
          applyEditAndEnterInsert(result);
          return;
        }
        case "D": {
          e.preventDefault();
          applyOperator("d", "$", withSelection().start);
          return;
        }
        case "y": {
          e.preventDefault();
          // Start yank operator pending state
          pendingOpRef.current = { op: "y", at: now, args: [] };
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
          // In normal mode, cursor should be ON a character, not after it
          // Move back one if we're past the end of text
          const pos = withSelection().start;
          const normalPos = Math.min(pos, Math.max(0, value.length - 1));
          setTimeout(() => setCursor(normalPos), 0);
          return;
        }
        // Otherwise, allow browser default typing behavior
        return;
      }

      // Normal mode handling
      handleNormalKey(e);
    };

    // Build mode indicator text
    const modeText = (() => {
      if (vimMode !== "normal") return "";
      const pending = pendingOpRef.current;
      if (!pending) return "NORMAL";
      // Show pending operator and any accumulated args
      const args = pending.args?.join("") || "";
      return `NORMAL ${pending.op}${args}`;
    })();

    return (
      <div style={{ width: "100%" }} data-component="VimTextAreaContainer">
        <ModeIndicator aria-live="polite">{modeText}</ModeIndicator>
        <div style={{ position: "relative" }} data-component="VimTextAreaWrapper">
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
          {vimMode === "normal" && value.length === 0 && <EmptyCursor />}
        </div>
      </div>
    );
  }
);

VimTextArea.displayName = "VimTextArea";
