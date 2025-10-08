import { describe, expect, test } from "@jest/globals";
import * as vim from "./vim";

describe("getLinesInfo", () => {
  test("single line", () => {
    const { lines, starts } = vim.getLinesInfo("hello");
    expect(lines).toEqual(["hello"]);
    expect(starts).toEqual([0]);
  });

  test("multiple lines", () => {
    const { lines, starts } = vim.getLinesInfo("line1\nline2\nline3");
    expect(lines).toEqual(["line1", "line2", "line3"]);
    expect(starts).toEqual([0, 6, 12]);
  });

  test("empty string", () => {
    const { lines, starts } = vim.getLinesInfo("");
    expect(lines).toEqual([""]);
    expect(starts).toEqual([0]);
  });
});

describe("getRowCol", () => {
  test("first line", () => {
    expect(vim.getRowCol("hello\nworld", 3)).toEqual({ row: 0, col: 3 });
  });

  test("second line", () => {
    expect(vim.getRowCol("hello\nworld", 8)).toEqual({ row: 1, col: 2 });
  });

  test("at newline", () => {
    expect(vim.getRowCol("hello\nworld", 5)).toEqual({ row: 0, col: 5 });
  });
});

describe("indexAt", () => {
  test("converts row/col to index", () => {
    const text = "hello\nworld\nfoo";
    expect(vim.indexAt(text, 0, 3)).toBe(3);
    expect(vim.indexAt(text, 1, 2)).toBe(8);
    expect(vim.indexAt(text, 2, 0)).toBe(12);
  });

  test("clamps out of bounds", () => {
    const text = "hi\nbye";
    expect(vim.indexAt(text, 10, 0)).toBe(3); // row 1, col 0
    expect(vim.indexAt(text, 0, 100)).toBe(2); // row 0, last col
  });
});

describe("lineEndAtIndex", () => {
  test("finds line end", () => {
    const text = "hello\nworld\nfoo";
    expect(vim.lineEndAtIndex(text, 3)).toBe(5); // "hello" ends at 5
    expect(vim.lineEndAtIndex(text, 8)).toBe(11); // "world" ends at 11
  });
});

describe("getLineBounds", () => {
  test("first line", () => {
    const text = "hello\nworld";
    expect(vim.getLineBounds(text, 3)).toEqual({ lineStart: 0, lineEnd: 5, row: 0 });
  });

  test("second line", () => {
    const text = "hello\nworld";
    expect(vim.getLineBounds(text, 8)).toEqual({ lineStart: 6, lineEnd: 11, row: 1 });
  });
});

describe("moveVertical", () => {
  const text = "hello\nworld\nfoo bar\nbaz";

  test("move down", () => {
    const result = vim.moveVertical(text, 2, 1, null);
    expect(vim.getRowCol(text, result.cursor)).toEqual({ row: 1, col: 2 });
  });

  test("move up", () => {
    const result = vim.moveVertical(text, 8, -1, null);
    expect(vim.getRowCol(text, result.cursor)).toEqual({ row: 0, col: 2 });
  });

  test("maintains desiredColumn", () => {
    const result1 = vim.moveVertical(text, 4, 1, null); // row 0, col 4 -> row 1, col 4
    expect(result1.desiredColumn).toBe(4);
    const result2 = vim.moveVertical(text, result1.cursor, 1, result1.desiredColumn);
    expect(vim.getRowCol(text, result2.cursor)).toEqual({ row: 2, col: 4 });
  });

  test("clamps column to line length", () => {
    const result = vim.moveVertical(text, 16, 1, null); // row 2 (foo bar) -> row 3 (baz)
    const { row, col } = vim.getRowCol(text, result.cursor);
    expect(row).toBe(3);
    expect(col).toBeLessThanOrEqual(3); // "baz" is shorter
  });
});

describe("moveWordForward", () => {
  test("moves to next word", () => {
    const text = "hello world foo";
    expect(vim.moveWordForward(text, 0)).toBe(6); // start of "world"
    expect(vim.moveWordForward(text, 6)).toBe(12); // start of "foo"
  });

  test("at end of text", () => {
    const text = "hello";
    // In normal mode, cursor clamps to last character (never past the end)
    expect(vim.moveWordForward(text, 3)).toBe(4);
  });
});

describe("moveWordBackward", () => {
  test("moves to previous word", () => {
    const text = "hello world foo";
    expect(vim.moveWordBackward(text, 12)).toBe(6); // start of "world"
    expect(vim.moveWordBackward(text, 6)).toBe(0); // start of "hello"
  });
});

describe("wordBoundsAt", () => {
  test("finds word bounds", () => {
    const text = "hello world foo";
    expect(vim.wordBoundsAt(text, 2)).toEqual({ start: 0, end: 5 }); // "hello"
    expect(vim.wordBoundsAt(text, 7)).toEqual({ start: 6, end: 11 }); // "world"
  });

  test("on whitespace, finds next word", () => {
    const text = "hello world";
    expect(vim.wordBoundsAt(text, 5)).toEqual({ start: 6, end: 11 }); // space -> "world"
  });

  test("empty text", () => {
    expect(vim.wordBoundsAt("", 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("deleteRange", () => {
  test("deletes range and yanks", () => {
    const result = vim.deleteRange("hello world", 5, 11, true, "");
    expect(result.text).toBe("hello");
    expect(result.cursor).toBe(5);
    expect(result.yankBuffer).toBe(" world");
  });

  test("deletes without yanking", () => {
    const result = vim.deleteRange("hello world", 5, 11, false, "old");
    expect(result.text).toBe("hello");
    expect(result.yankBuffer).toBe("old");
  });
});

describe("deleteCharUnderCursor", () => {
  test("deletes single character", () => {
    const result = vim.deleteCharUnderCursor("hello", 1, "");
    expect(result.text).toBe("hllo");
    expect(result.cursor).toBe(1);
    expect(result.yankBuffer).toBe("e");
  });

  test("at end of text does nothing", () => {
    const result = vim.deleteCharUnderCursor("hi", 2, "");
    expect(result.text).toBe("hi");
    expect(result.cursor).toBe(2);
  });
});

describe("deleteLine", () => {
  test("deletes line with newline", () => {
    const result = vim.deleteLine("hello\nworld\nfoo", 3, "");
    expect(result.text).toBe("world\nfoo");
    expect(result.cursor).toBe(0);
    expect(result.yankBuffer).toBe("hello\n");
  });

  test("deletes last line without trailing newline", () => {
    const result = vim.deleteLine("hello\nworld", 8, "");
    expect(result.text).toBe("hello\n");
    expect(result.cursor).toBe(6);
    expect(result.yankBuffer).toBe("world");
  });
});

describe("yankLine", () => {
  test("yanks line with newline", () => {
    expect(vim.yankLine("hello\nworld", 2)).toBe("hello\n");
  });

  test("yanks last line without newline", () => {
    expect(vim.yankLine("hello\nworld", 8)).toBe("world");
  });
});

describe("pasteAfter", () => {
  test("pastes after cursor", () => {
    const result = vim.pasteAfter("hello", 2, " world");
    expect(result.text).toBe("he worldllo");
    expect(result.cursor).toBe(8); // cursor at end of pasted text
  });

  test("empty buffer does nothing", () => {
    const result = vim.pasteAfter("hello", 2, "");
    expect(result).toEqual({ text: "hello", cursor: 2 });
  });
});

describe("pasteBefore", () => {
  test("pastes before cursor", () => {
    const result = vim.pasteBefore("hello", 2, " world");
    expect(result.text).toBe("he worldllo");
    expect(result.cursor).toBe(2);
  });
});

describe("getInsertCursorPos", () => {
  const text = "hello\nworld";

  test("i: stays at cursor", () => {
    expect(vim.getInsertCursorPos(text, 3, "i")).toEqual({ cursor: 3, text });
  });

  test("a: moves one right", () => {
    expect(vim.getInsertCursorPos(text, 3, "a")).toEqual({ cursor: 4, text });
  });

  test("I: moves to line start", () => {
    expect(vim.getInsertCursorPos(text, 8, "I")).toEqual({ cursor: 6, text });
  });

  test("A: moves to line end", () => {
    expect(vim.getInsertCursorPos(text, 7, "A")).toEqual({ cursor: 11, text });
  });

  test("o: inserts newline after current line", () => {
    const result = vim.getInsertCursorPos(text, 3, "o");
    expect(result.text).toBe("hello\n\nworld");
    expect(result.cursor).toBe(6);
  });

  test("O: inserts newline before current line", () => {
    const result = vim.getInsertCursorPos(text, 8, "O");
    expect(result.text).toBe("hello\n\nworld");
    expect(result.cursor).toBe(6);
  });
});

describe("changeWord", () => {
  test("changes to next word boundary", () => {
    const result = vim.changeWord("hello world", 0, "");
    expect(result.text).toBe("world");
    expect(result.cursor).toBe(0);
    expect(result.yankBuffer).toBe("hello ");
  });
});

describe("changeInnerWord", () => {
  test("changes word under cursor", () => {
    const result = vim.changeInnerWord("hello world foo", 7, "");
    expect(result.text).toBe("hello  foo");
    expect(result.cursor).toBe(6);
    expect(result.yankBuffer).toBe("world");
  });
});

describe("changeToEndOfLine", () => {
  test("changes to end of line", () => {
    const result = vim.changeToEndOfLine("hello world", 6, "");
    expect(result.text).toBe("hello ");
    expect(result.cursor).toBe(6);
    expect(result.yankBuffer).toBe("world");
  });
});

describe("changeToBeginningOfLine", () => {
  test("changes to beginning of line", () => {
    const result = vim.changeToBeginningOfLine("hello world", 6, "");
    expect(result.text).toBe("world");
    expect(result.cursor).toBe(0);
    expect(result.yankBuffer).toBe("hello ");
  });
});

describe("changeLine", () => {
  test("changes entire line", () => {
    const result = vim.changeLine("hello\nworld\nfoo", 8, "");
    expect(result.text).toBe("hello\n\nfoo");
    expect(result.cursor).toBe(6);
    expect(result.yankBuffer).toBe("world");
  });
});
