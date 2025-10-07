import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import type { UIMode } from "@/types/mode";

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

type VimMode = "insert" | "normal";

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

    const lineEndAtIndex = (idx: number) => {
      const { lines, starts } = getLinesInfo();
      let row = 0;
      while (row + 1 < starts.length && starts[row + 1] <= idx) row++;
      const lineEnd = starts[row] + lines[row].length;
      return lineEnd;
    };

    const setCursor = (pos: number) => {
      const el = textareaRef.current!;
      const p = Math.max(0, Math.min(value.length, pos));
      const lineEnd = lineEndAtIndex(p);
      el.selectionStart = p;
      // In normal mode, show a 1-char selection (block cursor effect) when possible
      if (vimMode === "normal" && p < lineEnd) {
        el.selectionEnd = p + 1;
      } else {
        el.selectionEnd = p;
      }
      setDesiredColumn(null);
    };

    const getLinesInfo = useCallback(() => {
      const lines = value.split("\n");
      const starts: number[] = [];
      let acc = 0;
      for (let i = 0; i < lines.length; i++) {
        starts.push(acc);
        acc += lines[i].length + (i < lines.length - 1 ? 1 : 0);
      }
      return { lines, starts };
    }, [value]);

    const getRowCol = useCallback(
      (idx: number) => {
        const { lines, starts } = getLinesInfo();
        let row = 0;
        while (row + 1 < starts.length && starts[row + 1] <= idx) row++;
        const col = idx - starts[row];
        return { row, col, lines, starts };
      },
      [getLinesInfo]
    );

    const indexAt = (row: number, col: number) => {
      const { lines, starts } = getLinesInfo();
      row = Math.max(0, Math.min(row, lines.length - 1));
      col = Math.max(0, Math.min(col, lines[row].length));
      return starts[row] + col;
    };

    const moveVert = (delta: number) => {
      const { start } = withSelection();
      const { row, col, lines } = getRowCol(start);
      const nextRow = Math.max(0, Math.min(lines.length - 1, row + delta));
      const goal = desiredColumn ?? col;
      const nextCol = Math.max(0, Math.min(goal, lines[nextRow].length));
      setCursor(indexAt(nextRow, nextCol));
      setDesiredColumn(goal);
    };

    const moveWordForward = () => {
      // Simple word definition: sequences of [A-Za-z0-9_]
      let i = withSelection().end;
      const n = value.length;
      // Skip current non-word
      while (i < n && /[A-Za-z0-9_]/.test(value[i])) i++;
      // Skip whitespace
      while (i < n && /\s/.test(value[i])) i++;
      setCursor(i);
    };

    const moveWordBackward = () => {
      let i = withSelection().start - 1;
      while (i > 0 && /\s/.test(value[i])) i--;
      while (i > 0 && /[A-Za-z0-9_]/.test(value[i - 1])) i--;
      setCursor(Math.max(0, i));
    };

    const lineBoundsAtCursor = () => {
      const { row, lines, starts } = getRowCol(withSelection().start);
      const lineStart = starts[row];
      const lineEnd = lineStart + lines[row].length; // no newline included
      return { lineStart, lineEnd, row };
    };

    const deleteRange = (from: number, to: number, yank = true) => {
      const a = Math.max(0, Math.min(from, to));
      const b = Math.max(0, Math.max(from, to));
      const before = value.slice(0, a);
      const removed = value.slice(a, b);
      const after = value.slice(b);
      if (yank) yankBufferRef.current = removed;
      const next = before + after;
      onChange(next);
      setTimeout(() => setCursor(a), 0);
    };

    const changeRange = (from: number, to: number) => {
      // Yank the deleted text, delete it, then enter insert mode at start
      deleteRange(from, to, true);
      setTimeout(() => {
        setVimMode("insert");
      }, 0);
    };

    const deleteCharUnderCursor = () => {
      const i = withSelection().start;
      if (i >= value.length) return; // nothing to delete
      deleteRange(i, i + 1, true);
    };

    const deleteLine = () => {
      const { lineStart, lineEnd } = lineBoundsAtCursor();
      // Include trailing newline if not last line
      const isLastLine = lineEnd === value.length;
      const to = isLastLine ? lineEnd : lineEnd + 1;
      const from = lineStart;
      // Yank full line (including newline when possible)
      yankBufferRef.current = value.slice(from, to);
      deleteRange(from, to, false);
    };

    const yankLine = () => {
      const { lineStart, lineEnd } = lineBoundsAtCursor();
      const isLastLine = lineEnd === value.length;
      const to = isLastLine ? lineEnd : lineEnd + 1;
      yankBufferRef.current = value.slice(lineStart, to);
    };

    const pasteAfter = () => {
      const buf = yankBufferRef.current;
      if (!buf) return;
      const i = withSelection().start;
      const next = value.slice(0, i) + buf + value.slice(i);
      onChange(next);
      setTimeout(() => setCursor(i + buf.length), 0);
    };

    const pasteBefore = () => {
      const buf = yankBufferRef.current;
      if (!buf) return;
      const i = withSelection().start;
      const next = value.slice(0, i) + buf + value.slice(i);
      onChange(next);
      setTimeout(() => setCursor(i), 0);
    };

    const enterInsertMode = (placeCursor?: (pos: number) => number) => {
      const pos = withSelection().start;
      if (placeCursor) {
        const p = placeCursor(pos);
        setCursor(p);
      }
      setVimMode("insert");
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

    const wordBoundsAt = (idx: number) => {
      // Returns [start, end) for the word under cursor. If on whitespace, uses the next word to the right.
      const n = value.length;
      let i = Math.max(0, Math.min(n, idx));
      const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
      if (i >= n) i = n - 1;
      // If we're out of range or empty
      if (n === 0) return { start: 0, end: 0 };
      if (i < 0) i = 0;
      if (!isWord(value[i])) {
        // Move right to next word
        let j = i;
        while (j < n && !isWord(value[j])) j++;
        if (j >= n) return { start: n, end: n };
        i = j;
      }
      let a = i;
      while (a > 0 && isWord(value[a - 1])) a--;
      let b = i + 1;
      while (b < n && isWord(value[b])) b++;
      return { start: a, end: b };
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
        // Second char after 'c'
        if (args.length === 0) {
          if (key === "c") {
            // cc: change entire line
            pendingOpRef.current = null;
            const { lineStart, lineEnd } = lineBoundsAtCursor();
            changeRange(lineStart, lineEnd);
            return;
          }
          if (key === "w") {
            // cw: change to next word boundary
            pendingOpRef.current = null;
            const start = withSelection().start;
            // Move to next word boundary like 'w', but delete from current cursor to that point
            let i = start;
            const n = value.length;
            // Skip current word chars
            while (i < n && /[A-Za-z0-9_]/.test(value[i])) i++;
            // Skip whitespace
            while (i < n && /\s/.test(value[i])) i++;
            changeRange(start, i);
            return;
          }
          if (key === "$" || key === "End") {
            // c$ : change to end of line
            pendingOpRef.current = null;
            const { lineEnd } = lineBoundsAtCursor();
            const start = withSelection().start;
            changeRange(start, lineEnd);
            return;
          }
          if (key === "0" || key === "Home") {
            // c0 : change to beginning of line
            pendingOpRef.current = null;
            const { lineStart } = lineBoundsAtCursor();
            const start = withSelection().start;
            changeRange(lineStart, start);
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
            const { start } = withSelection();
            const { start: a, end: b } = wordBoundsAt(start);
            changeRange(a, b);
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
        case "i":
          e.preventDefault();
          enterInsertMode();
          return;
        case "a":
          e.preventDefault();
          enterInsertMode((pos) => Math.min(pos + 1, value.length));
          return;
        case "I":
          e.preventDefault();
          enterInsertMode(() => lineBoundsAtCursor().lineStart);
          return;
        case "A":
          e.preventDefault();
          enterInsertMode(() => lineBoundsAtCursor().lineEnd);
          return;
        case "o": {
          e.preventDefault();
          const { lineEnd } = lineBoundsAtCursor();
          const next = value.slice(0, lineEnd) + "\n" + value.slice(lineEnd);
          onChange(next);
          setTimeout(() => {
            setCursor(lineEnd + 1);
            setVimMode("insert");
          }, 0);
          return;
        }
        case "O": {
          e.preventDefault();
          const { lineStart } = lineBoundsAtCursor();
          const next = value.slice(0, lineStart) + "\n" + value.slice(lineStart);
          onChange(next);
          setTimeout(() => {
            setCursor(lineStart);
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
