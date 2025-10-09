/**
 * Core Vim text manipulation utilities.
 * All functions are pure and accept text + cursor position, returning new state.
 *
 * Keep in sync with:
 * - docs/vim-mode.md (user documentation)
 * - src/components/VimTextArea.tsx (React component integration)
 * - src/utils/vim.test.ts (integration tests)
 */

export type VimMode = "insert" | "normal";

export interface VimState {
  text: string;
  cursor: number;
  mode: VimMode;
  yankBuffer: string;
  desiredColumn: number | null;
  pendingOp: null | { op: "d" | "y" | "c"; at: number; args?: string[] };
}

export type VimAction = "undo" | "redo";

export type VimKeyResult =
  | { handled: false } // Browser should handle this key
  | { handled: true; newState: VimState; action?: VimAction }; // Vim handled it

export interface LinesInfo {
  lines: string[];
  starts: number[]; // start index of each line
}

/**
 * Parse text into lines and compute start indices.
 */
export function getLinesInfo(text: string): LinesInfo {
  const lines = text.split("\n");
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    starts.push(acc);
    acc += lines[i].length + (i < lines.length - 1 ? 1 : 0);
  }
  return { lines, starts };
}

/**
 * Convert index to (row, col) coordinates.
 */
export function getRowCol(text: string, idx: number): { row: number; col: number } {
  const { starts } = getLinesInfo(text);
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1] <= idx) row++;
  const col = idx - starts[row];
  return { row, col };
}

/**
 * Convert (row, col) to index, clamping to valid range.
 */
export function indexAt(text: string, row: number, col: number): number {
  const { lines, starts } = getLinesInfo(text);
  row = Math.max(0, Math.min(row, lines.length - 1));
  col = Math.max(0, Math.min(col, lines[row].length));
  return starts[row] + col;
}

/**
 * Get the end index of the line containing idx.
 */
export function lineEndAtIndex(text: string, idx: number): number {
  const { lines, starts } = getLinesInfo(text);
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1] <= idx) row++;
  const lineEnd = starts[row] + lines[row].length;
  return lineEnd;
}

/**
 * Get line bounds (start, end) for the line containing cursor.
 */
export function getLineBounds(
  text: string,
  cursor: number
): { lineStart: number; lineEnd: number; row: number } {
  const { row } = getRowCol(text, cursor);
  const { lines, starts } = getLinesInfo(text);
  const lineStart = starts[row];
  const lineEnd = lineStart + lines[row].length;
  return { lineStart, lineEnd, row };
}

/**
 * Move cursor vertically by delta lines, maintaining desiredColumn if provided.
 */
export function moveVertical(
  text: string,
  cursor: number,
  delta: number,
  desiredColumn: number | null
): { cursor: number; desiredColumn: number } {
  const { row, col } = getRowCol(text, cursor);
  const { lines } = getLinesInfo(text);
  const nextRow = Math.max(0, Math.min(lines.length - 1, row + delta));
  const goal = desiredColumn ?? col;
  const nextCol = Math.max(0, Math.min(goal, lines[nextRow].length));
  return {
    cursor: indexAt(text, nextRow, nextCol),
    desiredColumn: goal,
  };
}

/**
 * Move cursor to next word boundary (like 'w').
 * In normal mode, cursor should never go past the last character.
 */
export function moveWordForward(text: string, cursor: number): number {
  let i = cursor;
  const n = text.length;
  while (i < n && /[A-Za-z0-9_]/.test(text[i])) i++;
  while (i < n && /\s/.test(text[i])) i++;
  // Clamp to last character position in normal mode (never past the end)
  return Math.min(i, Math.max(0, n - 1));
}


/**
 * Move cursor to end of current/next word (like 'e').
 * If on a word character, goes to end of current word.
 * If on whitespace, goes to end of next word.
 */
export function moveWordEnd(text: string, cursor: number): number {
  const n = text.length;
  if (cursor >= n - 1) return Math.max(0, n - 1);
  
  let i = cursor;
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  
  // If on a word char, move to end of this word
  if (isWord(text[i])) {
    while (i < n - 1 && isWord(text[i + 1])) i++;
    return i;
  }
  
  // If on whitespace, skip to next word then go to its end
  while (i < n - 1 && !isWord(text[i])) i++;
  while (i < n - 1 && isWord(text[i + 1])) i++;
  
  return Math.min(i, Math.max(0, n - 1));
}

/**
 * Move cursor to previous word boundary (like 'b').
 * In normal mode, cursor should never go past the last character.
 */
export function moveWordBackward(text: string, cursor: number): number {
  let i = cursor - 1;
  while (i > 0 && /\s/.test(text[i])) i--;
  while (i > 0 && /[A-Za-z0-9_]/.test(text[i - 1])) i--;
  // Clamp to last character position in normal mode (never past the end)
  return Math.min(Math.max(0, i), Math.max(0, text.length - 1));
}

/**
 * Get word bounds at the given index.
 * If on whitespace, uses the next word to the right.
 */
export function wordBoundsAt(text: string, idx: number): { start: number; end: number } {
  const n = text.length;
  let i = Math.max(0, Math.min(n, idx));
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (i >= n) i = n - 1;
  if (n === 0) return { start: 0, end: 0 };
  if (i < 0) i = 0;
  if (!isWord(text[i])) {
    let j = i;
    while (j < n && !isWord(text[j])) j++;
    if (j >= n) return { start: n, end: n };
    i = j;
  }
  let a = i;
  while (a > 0 && isWord(text[a - 1])) a--;
  let b = i + 1;
  while (b < n && isWord(text[b])) b++;
  return { start: a, end: b };
}

/**
 * Delete range [from, to) and optionally store in yankBuffer.
 */
export function deleteRange(
  text: string,
  from: number,
  to: number,
  yank: boolean,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.max(0, Math.max(from, to));
  const removed = text.slice(a, b);
  const newText = text.slice(0, a) + text.slice(b);
  return {
    text: newText,
    cursor: a,
    yankBuffer: yank ? removed : yankBuffer,
  };
}

/**
 * Delete the character under cursor (like 'x').
 */
export function deleteCharUnderCursor(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  if (cursor >= text.length) return { text, cursor, yankBuffer };
  return deleteRange(text, cursor, cursor + 1, true, yankBuffer);
}

/**
 * Delete entire line (like 'dd').
 */
export function deleteLine(
  text: string,
  cursor: number,
  _yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  const isLastLine = lineEnd === text.length;
  const to = isLastLine ? lineEnd : lineEnd + 1;
  const removed = text.slice(lineStart, to);
  const newText = text.slice(0, lineStart) + text.slice(to);
  return {
    text: newText,
    cursor: lineStart,
    yankBuffer: removed,
  };
}

/**
 * Yank entire line (like 'yy').
 */
export function yankLine(text: string, cursor: number): string {
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  const isLastLine = lineEnd === text.length;
  const to = isLastLine ? lineEnd : lineEnd + 1;
  return text.slice(lineStart, to);
}

/**
 * Paste yankBuffer after cursor (like 'p').
 */
export function pasteAfter(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number } {
  if (!yankBuffer) return { text, cursor };
  const newText = text.slice(0, cursor) + yankBuffer + text.slice(cursor);
  return { text: newText, cursor: cursor + yankBuffer.length };
}

/**
 * Paste yankBuffer before cursor (like 'P').
 */
export function pasteBefore(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number } {
  if (!yankBuffer) return { text, cursor };
  const newText = text.slice(0, cursor) + yankBuffer + text.slice(cursor);
  return { text: newText, cursor };
}

/**
 * Compute cursor placement for insert mode entry (i/a/I/A/o/O).
 */
export function getInsertCursorPos(
  text: string,
  cursor: number,
  mode: "i" | "a" | "I" | "A" | "o" | "O"
): { cursor: number; text: string } {
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  switch (mode) {
    case "i":
      return { cursor, text };
    case "a":
      return { cursor: Math.min(cursor + 1, text.length), text };
    case "I":
      return { cursor: lineStart, text };
    case "A":
      return { cursor: lineEnd, text };
    case "o": {
      const newText = text.slice(0, lineEnd) + "\n" + text.slice(lineEnd);
      return { cursor: lineEnd + 1, text: newText };
    }
    case "O": {
      const newText = text.slice(0, lineStart) + "\n" + text.slice(lineStart);
      return { cursor: lineStart, text: newText };
    }
  }
}

/**
 * Apply a change operator (delete + enter insert).
 */
export function changeRange(
  text: string,
  from: number,
  to: number,
  _yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  return deleteRange(text, from, to, true, _yankBuffer);
}

/**
 * Handle change word (cw).
 */
export function changeWord(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  let i = cursor;
  const n = text.length;
  while (i < n && /[A-Za-z0-9_]/.test(text[i])) i++;
  while (i < n && /\s/.test(text[i])) i++;
  return changeRange(text, cursor, i, yankBuffer);
}

/**
 * Handle change inner word (ciw).
 */
export function changeInnerWord(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const { start, end } = wordBoundsAt(text, cursor);
  return changeRange(text, start, end, yankBuffer);
}

/**
 * Handle change to end of line (C or c$).
 */
export function changeToEndOfLine(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const { lineEnd } = getLineBounds(text, cursor);
  return changeRange(text, cursor, lineEnd, yankBuffer);
}

/**
 * Handle change to beginning of line (c0).
 */
export function changeToBeginningOfLine(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const { lineStart } = getLineBounds(text, cursor);
  return changeRange(text, lineStart, cursor, yankBuffer);
}

/**
 * Handle change entire line (cc).
 */
export function changeLine(
  text: string,
  cursor: number,
  yankBuffer: string
): { text: string; cursor: number; yankBuffer: string } {
  const { lineStart, lineEnd } = getLineBounds(text, cursor);
  return changeRange(text, lineStart, lineEnd, yankBuffer);
}

/**
 * ============================================================================
 * CENTRAL STATE MACHINE
 * ============================================================================
 * All Vim key handling logic is centralized here for testability.
 * The component just calls handleKeyPress() and applies the result.
 */

interface KeyModifiers {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}

/**
 * Main entry point for handling key presses in Vim mode.
 * Returns null if browser should handle the key (e.g., typing in insert mode).
 * Returns new state if Vim handled the key.
 */
export function handleKeyPress(
  state: VimState,
  key: string,
  modifiers: KeyModifiers
): VimKeyResult {
  if (state.mode === "insert") {
    return handleInsertModeKey(state, key, modifiers);
  } else {
    return handleNormalModeKey(state, key, modifiers);
  }
}

/**
 * Handle keys in insert mode.
 * Most keys return { handled: false } so browser can handle typing.
 */
function handleInsertModeKey(state: VimState, key: string, modifiers: KeyModifiers): VimKeyResult {
  // ESC or Ctrl-[ -> enter normal mode
  if (key === "Escape" || (key === "[" && modifiers.ctrl)) {
    // Clamp cursor to valid position (can't be past end in normal mode)
    const normalCursor = Math.min(state.cursor, Math.max(0, state.text.length - 1));
    return {
      handled: true,
      newState: {
        ...state,
        mode: "normal",
        cursor: normalCursor,
        desiredColumn: null,
      },
    };
  }

  // Let browser handle all other keys in insert mode
  return { handled: false };
}

/**
 * Handle keys in normal mode.
 */
function handleNormalModeKey(state: VimState, key: string, modifiers: KeyModifiers): VimKeyResult {
  const now = Date.now();
  
  // Check for timeout on pending operator (800ms like Vim)
  let pending = state.pendingOp;
  if (pending && now - pending.at > 800) {
    pending = null;
  }

  // Handle pending operator + motion/text-object
  if (pending) {
    const result = handlePendingOperator(state, pending, key, modifiers, now);
    if (result) return result;
  }

  // Handle undo/redo
  if (key === "u") {
    return { handled: true, newState: state, action: "undo" };
  }
  if (key === "r" && modifiers.ctrl) {
    return { handled: true, newState: state, action: "redo" };
  }

  // Handle mode transitions (i/a/I/A/o/O)
  const insertResult = tryEnterInsertMode(state, key);
  if (insertResult) return insertResult;

  // Handle navigation
  const navResult = tryHandleNavigation(state, key);
  if (navResult) return navResult;

  // Handle edit commands
  const editResult = tryHandleEdit(state, key);
  if (editResult) return editResult;

  // Handle operators (d/c/y/D/C)
  const opResult = tryHandleOperator(state, key, now);
  if (opResult) return opResult;

  // Stay in normal mode for ESC
  if (key === "Escape" || (key === "[" && modifiers.ctrl)) {
    return { handled: true, newState: state };
  }

  // Swallow all other single-character keys in normal mode (don't type letters)
  if (key.length === 1 && !modifiers.ctrl && !modifiers.meta && !modifiers.alt) {
    return { handled: true, newState: state };
  }

  // Unknown key - let browser handle
  return { handled: false };
}

/**
 * Handle pending operator + motion/text-object combinations.
 */
function handlePendingOperator(
  state: VimState,
  pending: NonNullable<VimState["pendingOp"]>,
  key: string,
  _modifiers: KeyModifiers,
  now: number
): VimKeyResult | null {
  const args = pending.args ?? [];

  // Handle doubled operator (dd, yy, cc) -> line operation
  if (args.length === 0 && key === pending.op) {
    return {
      handled: true,
      newState: applyOperatorMotion(state, pending.op, "line"),
    };
  }

  // Handle text objects (currently just "iw")
  if (args.length === 1 && args[0] === "i" && key === "w") {
    return {
      handled: true,
      newState: applyOperatorTextObject(state, pending.op, "iw"),
    };
  }

  // Handle motions when no text object is pending
  if (args.length === 0) {
    // Word motions
    if (key === "w" || key === "W") {
      return {
        handled: true,
        newState: applyOperatorMotion(state, pending.op, "w"),
      };
    }
    if (key === "b" || key === "B") {
      return {
        handled: true,
        newState: applyOperatorMotion(state, pending.op, "b"),
      };    }
    if (key === "e" || key === "E") {
      return {
        handled: true,
        newState: applyOperatorMotion(state, pending.op, "e"),
      };
    }
    // Line motions
    if (key === "$" || key === "End") {
      return {
        handled: true,
        newState: applyOperatorMotion(state, pending.op, "$"),
      };
    }
    if (key === "0" || key === "Home") {
      return {
        handled: true,
        newState: applyOperatorMotion(state, pending.op, "0"),
      };
    }
    // Text object prefix
    if (key === "i") {
      return {
        handled: true,
        newState: {
          ...state,
          pendingOp: { op: pending.op, at: now, args: ["i"] },
        },
      };
    }
  }

  // Unknown motion - cancel pending operation
  return {
    handled: true,
    newState: { ...state, pendingOp: null },
  };
}

/**
 * Apply operator + motion combination.
 */
function applyOperatorMotion(
  state: VimState,
  op: "d" | "c" | "y",
  motion: "w" | "b" | "e" | "$" | "0" | "line"
): VimState {
  const { text, cursor, yankBuffer, mode } = state;

  // Delete operator
  if (op === "d") {
    let result: { text: string; cursor: number; yankBuffer: string };
    
    switch (motion) {
      case "w":
        result = deleteRange(text, cursor, moveWordForward(text, cursor), true, yankBuffer);
        break;
      case "b":
        result = deleteRange(text, moveWordBackward(text, cursor), cursor, true, yankBuffer);
        break;
      case "e":
        result = deleteRange(text, cursor, moveWordEnd(text, cursor) + 1, true, yankBuffer);
        break;
      case "$": {
        const { lineEnd } = getLineBounds(text, cursor);
        result = deleteRange(text, cursor, lineEnd, true, yankBuffer);
        break;
      }
      case "0": {
        const { lineStart } = getLineBounds(text, cursor);
        result = deleteRange(text, lineStart, cursor, true, yankBuffer);
        break;
      }
      case "line":
        result = deleteLine(text, cursor, yankBuffer);
        break;
    }

    return {
      ...state,
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  // Change operator (delete + enter insert mode)
  if (op === "c") {
    let result: { text: string; cursor: number; yankBuffer: string };
    
    switch (motion) {
      case "w":
        result = changeWord(text, cursor, yankBuffer);
        break;
      case "b":
        result = changeRange(text, moveWordBackward(text, cursor), cursor, yankBuffer);
        break;
      case "e":
        result = changeRange(text, cursor, moveWordEnd(text, cursor) + 1, yankBuffer);
        break;
      case "$":
        result = changeToEndOfLine(text, cursor, yankBuffer);
        break;
      case "0":
        result = changeToBeginningOfLine(text, cursor, yankBuffer);
        break;
      case "line":
        result = changeLine(text, cursor, yankBuffer);
        break;
    }

    return {
      ...state,
      mode: "insert",
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  // Yank operator (copy without modifying text)
  if (op === "y") {
    let yanked: string;
    
    switch (motion) {
      case "w":
        yanked = text.slice(cursor, moveWordForward(text, cursor));
        break;
      case "b":
        yanked = text.slice(moveWordBackward(text, cursor), cursor);
        break;
      case "e":
        yanked = text.slice(cursor, moveWordEnd(text, cursor) + 1);
        break;
      case "$": {
        const { lineEnd } = getLineBounds(text, cursor);
        yanked = text.slice(cursor, lineEnd);
        break;
      }
      case "0": {
        const { lineStart } = getLineBounds(text, cursor);
        yanked = text.slice(lineStart, cursor);
        break;
      }
      case "line":
        yanked = yankLine(text, cursor);
        break;
    }

    return {
      ...state,
      yankBuffer: yanked,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  return state;
}

/**
 * Apply operator + text object combination.
 */
function applyOperatorTextObject(
  state: VimState,
  op: "d" | "c" | "y",
  textObj: "iw"
): VimState {
  if (textObj !== "iw") return state;

  const { text, cursor, yankBuffer } = state;
  const { start, end } = wordBoundsAt(text, cursor);

  if (op === "d") {
    const result = deleteRange(text, start, end, true, yankBuffer);
    return {
      ...state,
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  if (op === "c") {
    const result = changeInnerWord(text, cursor, yankBuffer);
    return {
      ...state,
      mode: "insert",
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  if (op === "y") {
    const yanked = text.slice(start, end);
    return {
      ...state,
      yankBuffer: yanked,
      pendingOp: null,
      desiredColumn: null,
    };
  }

  return state;
}

/**
 * Try to handle insert mode entry (i/a/I/A/o/O).
 */
function tryEnterInsertMode(state: VimState, key: string): VimKeyResult | null {
  const modes: Array<"i" | "a" | "I" | "A" | "o" | "O"> = ["i", "a", "I", "A", "o", "O"];
  
  if (!modes.includes(key as any)) return null;

  const result = getInsertCursorPos(state.text, state.cursor, key as any);
  
  return {
    handled: true,
    newState: {
      ...state,
      mode: "insert",
      text: result.text,
      cursor: result.cursor,
      desiredColumn: null,
    },
  };
}

/**
 * Try to handle navigation commands (h/j/k/l/w/b/0/$).
 */
function tryHandleNavigation(state: VimState, key: string): VimKeyResult | null {
  const { text, cursor, desiredColumn } = state;

  switch (key) {
    case "h": {
      const newCursor = Math.max(0, cursor - 1);
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };
    }
    case "l": {
      const newCursor = Math.min(cursor + 1, Math.max(0, text.length - 1));
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };
    }
    case "j": {
      const result = moveVertical(text, cursor, 1, desiredColumn);
      return {
        handled: true,
        newState: { ...state, cursor: result.cursor, desiredColumn: result.desiredColumn },
      };
    }
    case "k": {
      const result = moveVertical(text, cursor, -1, desiredColumn);
      return {
        handled: true,
        newState: { ...state, cursor: result.cursor, desiredColumn: result.desiredColumn },
      };
    }
    case "w":
    case "W": {
      const newCursor = moveWordForward(text, cursor);
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };
    }
    case "b":
    case "B": {
      const newCursor = moveWordBackward(text, cursor);
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };    }
    case "e":
    case "E": {
      const newCursor = moveWordEnd(text, cursor);
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };
    }
    case "0":
    case "Home": {
      const { lineStart } = getLineBounds(text, cursor);
      return {
        handled: true,
        newState: { ...state, cursor: lineStart, desiredColumn: null },
      };
    }
    case "$":
    case "End": {
      const { lineStart, lineEnd } = getLineBounds(text, cursor);
      // In normal mode, $ goes to last character, not after it
      // Special case: empty line stays at lineStart
      const newCursor = lineEnd > lineStart ? lineEnd - 1 : lineStart;
      return {
        handled: true,
        newState: { ...state, cursor: newCursor, desiredColumn: null },
      };
    }
  }

  return null;
}

/**
 * Try to handle edit commands (x/p/P).
 */
function tryHandleEdit(state: VimState, key: string): VimKeyResult | null {
  const { text, cursor, yankBuffer } = state;

  switch (key) {
    case "x": {
      if (cursor >= text.length) return null;
      const result = deleteCharUnderCursor(text, cursor, yankBuffer);
      return {
        handled: true,
        newState: {
          ...state,
          text: result.text,
          cursor: result.cursor,
          yankBuffer: result.yankBuffer,
          desiredColumn: null,
        },
      };
    }
    case "p": {
      // In normal mode, cursor is ON a character. Paste AFTER means after that character.
      const result = pasteAfter(text, cursor + 1, yankBuffer);
      return {
        handled: true,
        newState: {
          ...state,
          text: result.text,
          cursor: result.cursor - 1, // Adjust back to normal mode positioning
          desiredColumn: null,
        },
      };
    }
    case "P": {
      const result = pasteBefore(text, cursor, yankBuffer);
      return {
        handled: true,
        newState: {
          ...state,
          text: result.text,
          cursor: result.cursor,
          desiredColumn: null,
        },
      };
    }
  }

  return null;
}

/**
 * Try to handle operator commands (d/c/y/D/C).
 */
function tryHandleOperator(state: VimState, key: string, now: number): VimKeyResult | null {
  switch (key) {
    case "d":
      return {
        handled: true,
        newState: {
          ...state,
          pendingOp: { op: "d", at: now, args: [] },
        },
      };
    case "c":
      return {
        handled: true,
        newState: {
          ...state,
          pendingOp: { op: "c", at: now, args: [] },
        },
      };
    case "y":
      return {
        handled: true,
        newState: {
          ...state,
          pendingOp: { op: "y", at: now, args: [] },
        },
      };
    case "D": {
      const newState = applyOperatorMotion(state, "d", "$");
      return { handled: true, newState };
    }
    case "C": {
      const newState = applyOperatorMotion(state, "c", "$");
      return { handled: true, newState };
    }
  }

  return null;
}
