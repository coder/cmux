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
  yankBuffer: string;
  desiredColumn: number | null;
  pendingOp: null | { op: "d" | "y" | "c"; at: number; args?: string[] };
}

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
