/**
 * Vim Command Integration Tests
 *
 * These tests verify complete Vim command workflows, not isolated utility functions.
 * Each test simulates a sequence of key presses and verifies the final state.
 *
 * Test format:
 * - Initial state: text, cursor position, mode
 * - Execute: sequence of key presses (e.g., ["Escape", "d", "$"])
 * - Assert: final text, cursor position, mode, yank buffer
 *
 * This approach catches integration bugs that unit tests miss:
 * - Cursor positioning across mode transitions
 * - Operator-motion composition
 * - State management between key presses
 */

import { describe, expect, test } from "@jest/globals";
import * as vim from "./vim";

/**
 * Test state representing a Vim session at a point in time
 */
interface VimState {
  text: string;
  cursor: number; // cursor position (index in text)
  mode: vim.VimMode;
  yankBuffer: string;
  desiredColumn: number | null;
}

/**
 * Execute a sequence of Vim commands and return the final state.
 * This simulates how the VimTextArea component processes key events.
 */
function executeVimCommands(initial: VimState, keys: string[]): VimState {
  let state = { ...initial };
  let pendingOp: { op: "d" | "c" | "y"; at: number } | null = null;
  let pendingTextObj: "i" | null = null; // For text objects like "iw"

  for (const key of keys) {
    // Mode transitions
    if (key === "Escape" || key === "Ctrl-[") {
      // Enter normal mode, clamp cursor to valid position
      const maxCursor = Math.max(0, state.text.length - 1);
      state.cursor = Math.min(state.cursor, maxCursor);
      state.mode = "normal";
      pendingOp = null;
      continue;
    }

    if (state.mode === "insert") {
      // In insert mode, only ESC matters for these tests
      continue;
    }

    // Normal mode commands
    if (state.mode === "normal") {
      // Handle special shortcuts without pending operator
      if (key === "D" && !pendingOp) {
        const result = applyOperatorMotion(state, "d", "$", state.cursor);
        state = result;
        continue;
      }
      if (key === "C" && !pendingOp) {
        const result = applyOperatorMotion(state, "c", "$", state.cursor);
        state = result;
        continue;
      }

      // Operators (must check before motions since motions can also be operator targets)
      if (["d", "c", "y"].includes(key)) {
        if (pendingOp && pendingOp.op === key) {
          // Double operator: operate on line (dd, cc, yy)
          const cursor = state.cursor;
          if (key === "d") {
            const result = vim.deleteLine(state.text, cursor, state.yankBuffer);
            state.text = result.text;
            state.cursor = result.cursor;
            state.yankBuffer = result.yankBuffer;
          } else if (key === "c") {
            const result = vim.changeLine(state.text, cursor, state.yankBuffer);
            state.text = result.text;
            state.cursor = result.cursor;
            state.yankBuffer = result.yankBuffer;
            state.mode = "insert";
          } else if (key === "y") {
            state.yankBuffer = vim.yankLine(state.text, cursor);
          }
          pendingOp = null;
        } else {
          // Start pending operator
          pendingOp = { op: key as "d" | "c" | "y", at: state.cursor };
        }
        continue;
      }

      // Operator motions (check if we have a pending operator before treating as navigation)
      if (pendingOp) {
        const { op, at } = pendingOp;
        let motion: "w" | "b" | "$" | "0" | null = null;
        let textObject: "iw" | null = null;

        // Handle text objects (two-key sequences)
        if (pendingTextObj === "i") {
          if (key === "w") {
            textObject = "iw";
            pendingTextObj = null;
          }
        } else if (key === "i") {
          // Start text object sequence
          pendingTextObj = "i";
          continue;
        }

        // Handle motions (only if no text object was set)
        if (!textObject) {
          if (key === "w" || key === "W") motion = "w";
          else if (key === "b" || key === "B") motion = "b";
          else if (key === "$") motion = "$";
          else if (key === "0") motion = "0";
          else if (key === "D") {
            motion = "$";
            pendingOp.op = "d";
          } else if (key === "C") {
            motion = "$";
            pendingOp.op = "c";
          }
        }

        // Apply motion or text object
        if (motion) {
          const result = applyOperatorMotion(state, op, motion, at);
          state = result;
          pendingOp = null;
          pendingTextObj = null;
          continue;
        } else if (textObject) {
          const result = applyOperatorTextObject(state, op, textObject, at);
          state = result;
          pendingOp = null;
          pendingTextObj = null;
          continue;
        }
        // If not a motion or text object, fall through (cancels pending op)
        pendingOp = null;
        pendingTextObj = null;
      }

      // Insert mode entry
      if (["i", "a", "I", "A", "o", "O"].includes(key)) {
        const result = vim.getInsertCursorPos(
          state.text,
          state.cursor,
          key as "i" | "a" | "I" | "A" | "o" | "O",
        );
        state.text = result.text;
        state.cursor = result.cursor;
        state.mode = "insert";
        continue;
      }

      // Navigation (only without pending operator)
      if (key === "h") {
        state.cursor = Math.max(0, state.cursor - 1);
        continue;
      }
      if (key === "l") {
        state.cursor = Math.min(state.text.length - 1, state.cursor + 1);
        continue;
      }
      if (key === "j") {
        const result = vim.moveVertical(state.text, state.cursor, 1, state.desiredColumn);
        state.cursor = result.cursor;
        state.desiredColumn = result.desiredColumn;
        continue;
      }
      if (key === "k") {
        const result = vim.moveVertical(state.text, state.cursor, -1, state.desiredColumn);
        state.cursor = result.cursor;
        state.desiredColumn = result.desiredColumn;
        continue;
      }
      if (key === "w" || key === "W") {
        state.cursor = vim.moveWordForward(state.text, state.cursor);
        state.desiredColumn = null;
        continue;
      }
      if (key === "b" || key === "B") {
        state.cursor = vim.moveWordBackward(state.text, state.cursor);
        state.desiredColumn = null;
        continue;
      }
      if (key === "0") {
        const { lineStart } = vim.getLineBounds(state.text, state.cursor);
        state.cursor = lineStart;
        state.desiredColumn = null;
        continue;
      }
      if (key === "$") {
        const { lineEnd } = vim.getLineBounds(state.text, state.cursor);
        // Special case: if lineEnd points to newline and we're not at it, go to char before newline
        // If line is empty (lineEnd == lineStart), stay at lineStart
        const { lineStart } = vim.getLineBounds(state.text, state.cursor);
        if (lineEnd > lineStart && state.text[lineEnd - 1] !== "\n") {
          state.cursor = lineEnd - 1; // Last char of line
        } else if (lineEnd > lineStart) {
          state.cursor = lineEnd - 1; // Char before newline
        } else {
          state.cursor = lineStart; // Empty line
        }
        state.desiredColumn = null;
        continue;
      }

      // Simple edits
      if (key === "x") {
        const result = vim.deleteCharUnderCursor(state.text, state.cursor, state.yankBuffer);
        state.text = result.text;
        state.cursor = result.cursor;
        state.yankBuffer = result.yankBuffer;
        continue;
      }

      // Paste
      if (key === "p") {
        // In normal mode, cursor is ON a character. Paste after means after cursor+1.
        const result = vim.pasteAfter(state.text, state.cursor + 1, state.yankBuffer);
        state.text = result.text;
        state.cursor = result.cursor - 1; // Adjust back to normal mode positioning
        continue;
      }
      if (key === "P") {
        const result = vim.pasteBefore(state.text, state.cursor, state.yankBuffer);
        state.text = result.text;
        state.cursor = result.cursor;
        continue;
      }


    }
  }

  return state;
}

/**
 * Apply an operator-motion combination (e.g., d$, cw, y0)
 */
function applyOperatorMotion(
  state: VimState,
  op: "d" | "c" | "y",
  motion: "w" | "b" | "$" | "0",
  at: number,
): VimState {
  const { text, yankBuffer } = state;
  let start: number;
  let end: number;

  // Calculate range based on motion
  // Note: ranges are exclusive on the end [start, end)
  if (motion === "w") {
    start = at;
    end = vim.moveWordForward(text, at);
  } else if (motion === "b") {
    start = vim.moveWordBackward(text, at);
    end = at;
  } else if (motion === "$") {
    start = at;
    const { lineEnd } = vim.getLineBounds(text, at);
    end = lineEnd;
  } else if (motion === "0") {
    const { lineStart } = vim.getLineBounds(text, at);
    start = lineStart;
    end = at;
  } else {
    return state;
  }

  // Normalize range
  if (start > end) [start, end] = [end, start];

  // Apply operator
  if (op === "d") {
    const result = vim.deleteRange(text, start, end, true, yankBuffer);
    return {
      ...state,
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      desiredColumn: null,
    };
  } else if (op === "c") {
    const result = vim.deleteRange(text, start, end, true, yankBuffer);
    return {
      ...state,
      text: result.text,
      cursor: result.cursor,
      yankBuffer: result.yankBuffer,
      mode: "insert",
      desiredColumn: null,
    };
  } else if (op === "y") {
    const yanked = text.slice(start, end);
    return {
      ...state,
      yankBuffer: yanked,
      desiredColumn: null,
    };
  }

  return state;
}


/**
 * Apply an operator with a text object (e.g., diw, ciw, yiw)
 */
function applyOperatorTextObject(
  state: VimState,
  op: "d" | "c" | "y",
  textObject: "iw",
  at: number,
): VimState {
  const { text, yankBuffer } = state;

  if (textObject === "iw") {
    // Inner word: get word bounds at cursor position
    const { start, end } = vim.wordBoundsAt(text, at);

    // Apply operator
    if (op === "d") {
      const result = vim.deleteRange(text, start, end, true, yankBuffer);
      return {
        ...state,
        text: result.text,
        cursor: result.cursor,
        yankBuffer: result.yankBuffer,
        desiredColumn: null,
      };
    } else if (op === "c") {
      const result = vim.deleteRange(text, start, end, true, yankBuffer);
      return {
        ...state,
        text: result.text,
        cursor: result.cursor,
        yankBuffer: result.yankBuffer,
        mode: "insert",
        desiredColumn: null,
      };
    } else if (op === "y") {
      const yanked = text.slice(start, end);
      return {
        ...state,
        yankBuffer: yanked,
        desiredColumn: null,
      };
    }
  }

  return state;
}

// =============================================================================
// Integration Tests for Complete Vim Commands
// =============================================================================

describe("Vim Command Integration Tests", () => {
  const initialState: VimState = {
    text: "",
    cursor: 0,
    mode: "insert",
    yankBuffer: "",
    desiredColumn: null,
  };

  describe("Mode Transitions", () => {
    test("ESC enters normal mode from insert", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 5, mode: "insert" },
        ["Escape"],
      );
      expect(state.mode).toBe("normal");
      expect(state.cursor).toBe(4); // Clamps to last char
    });

    test("i enters insert mode at cursor", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 2, mode: "normal" },
        ["i"],
      );
      expect(state.mode).toBe("insert");
      expect(state.cursor).toBe(2);
    });

    test("a enters insert mode after cursor", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 2, mode: "normal" },
        ["a"],
      );
      expect(state.mode).toBe("insert");
      expect(state.cursor).toBe(3);
    });

    test("o opens line below", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello\nworld", cursor: 2, mode: "normal" },
        ["o"],
      );
      expect(state.mode).toBe("insert");
      expect(state.text).toBe("hello\n\nworld");
      expect(state.cursor).toBe(6);
    });
  });

  describe("Navigation", () => {
    test("w moves to next word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 0, mode: "normal" },
        ["w"],
      );
      expect(state.cursor).toBe(6);
    });

    test("b moves to previous word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 12, mode: "normal" },
        ["b"],
      );
      expect(state.cursor).toBe(6);
    });

    test("$ moves to end of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 0, mode: "normal" },
        ["$"],
      );
      expect(state.cursor).toBe(10); // On last char, not past it
    });

    test("0 moves to start of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 10, mode: "normal" },
        ["0"],
      );
      expect(state.cursor).toBe(0);
    });
  });

  describe("Simple Edits", () => {
    test("x deletes character under cursor", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 1, mode: "normal" },
        ["x"],
      );
      expect(state.text).toBe("hllo");
      expect(state.cursor).toBe(1);
      expect(state.yankBuffer).toBe("e");
    });

    test("p pastes after cursor", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 2, mode: "normal", yankBuffer: "XX" },
        ["p"],
      );
      expect(state.text).toBe("helXXlo");
      expect(state.cursor).toBe(4);
    });

    test("P pastes before cursor", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 2, mode: "normal", yankBuffer: "XX" },
        ["P"],
      );
      expect(state.text).toBe("heXXllo");
      expect(state.cursor).toBe(2);
    });
  });

  describe("Line Operations", () => {
    test("dd deletes line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello\nworld\nfoo", cursor: 8, mode: "normal" },
        ["d", "d"],
      );
      expect(state.text).toBe("hello\nfoo");
      expect(state.yankBuffer).toBe("world\n");
    });

    test("yy yanks line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello\nworld", cursor: 2, mode: "normal" },
        ["y", "y"],
      );
      expect(state.text).toBe("hello\nworld"); // Text unchanged
      expect(state.yankBuffer).toBe("hello\n");
    });

    test("cc changes line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello\nworld\nfoo", cursor: 8, mode: "normal" },
        ["c", "c"],
      );
      expect(state.text).toBe("hello\n\nfoo");
      expect(state.mode).toBe("insert");
      expect(state.yankBuffer).toBe("world");
    });
  });

  describe("Operator + Motion: Delete", () => {
    test("d$ deletes to end of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["d", "$"],
      );
      expect(state.text).toBe("hello ");
      expect(state.cursor).toBe(6);
      expect(state.yankBuffer).toBe("world");
    });

    test("D deletes to end of line (shortcut)", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["D"],
      );
      expect(state.text).toBe("hello ");
      expect(state.cursor).toBe(6);
    });

    test("d0 deletes to beginning of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["d", "0"],
      );
      expect(state.text).toBe("world");
      expect(state.yankBuffer).toBe("hello ");
    });

    test("dw deletes to next word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 0, mode: "normal" },
        ["d", "w"],
      );
      expect(state.text).toBe("world foo");
      expect(state.yankBuffer).toBe("hello ");
    });

    test("db deletes to previous word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 12, mode: "normal" },
        ["d", "b"],
      );
      expect(state.text).toBe("hello foo");
    });
  });

  describe("Operator + Motion: Change", () => {
    test("c$ changes to end of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["c", "$"],
      );
      expect(state.text).toBe("hello ");
      expect(state.mode).toBe("insert");
      expect(state.cursor).toBe(6);
    });

    test("C changes to end of line (shortcut)", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["C"],
      );
      expect(state.text).toBe("hello ");
      expect(state.mode).toBe("insert");
    });

    test("c0 changes to beginning of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["c", "0"],
      );
      expect(state.text).toBe("world");
      expect(state.mode).toBe("insert");
    });

    test("cw changes to next word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 0, mode: "normal" },
        ["c", "w"],
      );
      expect(state.text).toBe("world");
      expect(state.mode).toBe("insert");
    });
  });

  describe("Operator + Motion: Yank", () => {
    test("y$ yanks to end of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["y", "$"],
      );
      expect(state.text).toBe("hello world"); // Text unchanged
      expect(state.yankBuffer).toBe("world");
      expect(state.mode).toBe("normal");
    });

    test("y0 yanks to beginning of line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "normal" },
        ["y", "0"],
      );
      expect(state.text).toBe("hello world");
      expect(state.yankBuffer).toBe("hello ");
    });

    test("yw yanks to next word", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 0, mode: "normal" },
        ["y", "w"],
      );
      expect(state.text).toBe("hello world");
      expect(state.yankBuffer).toBe("hello ");
    });
  });

  describe("Complex Workflows", () => {
    test("ESC then d$ deletes from insert cursor to end", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world", cursor: 6, mode: "insert" },
        ["Escape", "d", "$"],
      );
      // Cursor at 6 in insert mode stays at 6 after ESC (on 'w')
      // d$ deletes from 'w' to end of line
      expect(state.text).toBe("hello ");
      expect(state.mode).toBe("normal");
    });

    test("navigate with w, then delete with dw", () => {
      const state = executeVimCommands(
        { ...initialState, text: "one two three", cursor: 0, mode: "normal" },
        ["w", "d", "w"],
      );
      expect(state.text).toBe("one three");
    });

    test("yank line, navigate, paste", () => {
      const state = executeVimCommands(
        { ...initialState, text: "first\nsecond\nthird", cursor: 0, mode: "normal" },
        ["y", "y", "j", "j", "p"],
      );
      expect(state.yankBuffer).toBe("first\n");
      // After yy: cursor at 0, yank "first\n"
      // After jj: cursor moves down 2 lines to "third" (at index 13, on 't')
      // After p: pastes "first\n" after cursor position (character-wise in test harness)
      // Note: Real Vim would do line-wise paste, but test harness does character-wise
      expect(state.text).toBe("first\nsecond\ntfirst\nhird");
    });

    test("delete word, move, paste", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 0, mode: "normal" },
        ["d", "w", "w", "p"],
      );
      expect(state.yankBuffer).toBe("hello ");
      // After dw: text = "world foo", cursor at 0, yank "hello "
      // After w: cursor moves to start of "foo" (index 6)
      // After p: paste "hello " after cursor
      expect(state.text).toBe("world fhello oo");
    });
  });

  describe("Edge Cases", () => {
    test("$ on empty line", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello\n\nworld", cursor: 6, mode: "normal" },
        ["$"],
      );
      expect(state.cursor).toBe(6); // Empty line, stays at newline char
    });

    test("w at end of text", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 4, mode: "normal" },
        ["w"],
      );
      expect(state.cursor).toBe(4); // Clamps to last char
    });

    test("d$ at end of line deletes last char", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 4, mode: "normal" },
        ["d", "$"],
      );
      // Cursor at 4 (on 'o'), d$ deletes from 'o' to line end
      expect(state.text).toBe("hell");
    });

    test("x at end of text does nothing", () => {
      const state = executeVimCommands(
        { ...initialState, text: "hello", cursor: 5, mode: "normal" },
        ["x"],
      );
      expect(state.text).toBe("hello");
    });

  });

  describe("Reported Issues", () => {
    test("issue #1: ciw should delete inner word correctly", () => {
      // User reported: "ciw sometimes leaves a blank character highlighted"
      // Root cause: test harness was treating 'w' in 'ciw' as a motion, not text object
      // This caused 'ciw' to behave like 'cw' (change word forward)
      const state = executeVimCommands(
        { ...initialState, text: "hello world foo", cursor: 6, mode: "normal" },
        ["c", "i", "w"],
      );
      expect(state.text).toBe("hello  foo"); // Only "world" deleted, both spaces remain
      expect(state.mode).toBe("insert");
      expect(state.cursor).toBe(6); // Cursor at start of deleted word
    });

    test("issue #2: o on last line should insert line below", () => {
      // In Vim: o opens new line below current line, even on last line
      const state = executeVimCommands(
        { ...initialState, text: "first\nsecond\nthird", cursor: 15, mode: "normal" },
        ["o"],
      );
      expect(state.mode).toBe("insert");
      expect(state.text).toBe("first\nsecond\nthird\n"); // New line added
      expect(state.cursor).toBe(19); // Cursor on new line
    });

  });
});
