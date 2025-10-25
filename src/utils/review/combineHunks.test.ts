import { describe, test, expect } from "bun:test";
import { combineOverlappingHunks, type HunkWithExpansion } from "./combineHunks";
import type { DiffHunk } from "@/types/review";

describe("combineOverlappingHunks", () => {
  // Helper to create a simple hunk
  const createHunk = (oldStart: number, oldLines: number, content = "test"): DiffHunk => ({
    oldStart,
    oldLines,
    newStart: oldStart,
    newLines: oldLines,
    content,
    filePath: "test.ts",
    changeType: "modified",
  });

  test("returns single hunk unchanged", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5),
        hunkId: "hunk-1",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].combinedId).toBe("hunk-1");
    expect(result[0].sourceHunks).toHaveLength(1);
  });

  test("keeps non-overlapping hunks separate", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5), // lines 10-14
        hunkId: "hunk-1",
        expansion: { up: 0, down: 0 },
      },
      {
        hunk: createHunk(50, 5), // lines 50-54 (far away)
        hunkId: "hunk-2",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(2);
    expect(result[0].combinedId).toBe("hunk-1");
    expect(result[1].combinedId).toBe("hunk-2");
  });

  test("combines hunks that overlap with expansion", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5, "hunk1"), // lines 10-14
        hunkId: "hunk-1",
        expansion: { up: 0, down: 30 }, // expand down to line 44
      },
      {
        hunk: createHunk(40, 5, "hunk2"), // lines 40-44 (overlaps!)
        hunkId: "hunk-2",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].combinedId).toBe("hunk-1+hunk-2");
    expect(result[0].sourceHunks).toHaveLength(2);
    expect(result[0].sourceHunks[0].hunkId).toBe("hunk-1");
    expect(result[0].sourceHunks[1].hunkId).toBe("hunk-2");
  });

  test("combines adjacent hunks (within 3 lines)", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5), // lines 10-14
        hunkId: "hunk-1",
        expansion: { up: 0, down: 0 },
      },
      {
        hunk: createHunk(17, 5), // lines 17-21 (gap of 2 lines)
        hunkId: "hunk-2",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].combinedId).toBe("hunk-1+hunk-2");
  });

  test("does not combine hunks with gap > 3 lines", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5), // lines 10-14
        hunkId: "hunk-1",
        expansion: { up: 0, down: 0 },
      },
      {
        hunk: createHunk(19, 5), // lines 19-23 (gap of 4 lines)
        hunkId: "hunk-2",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(2);
  });

  test("combines multiple overlapping hunks into one", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5),
        hunkId: "hunk-1",
        expansion: { up: 0, down: 30 }, // expand to line 44
      },
      {
        hunk: createHunk(40, 5),
        hunkId: "hunk-2",
        expansion: { up: 0, down: 20 }, // expand to line 64
      },
      {
        hunk: createHunk(60, 5),
        hunkId: "hunk-3",
        expansion: { up: 0, down: 0 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].combinedId).toBe("hunk-1+hunk-2+hunk-3");
    expect(result[0].sourceHunks).toHaveLength(3);
  });

  test("preserves max expansion state", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5),
        hunkId: "hunk-1",
        expansion: { up: 30, down: 60 },
      },
      {
        hunk: createHunk(12, 5),
        hunkId: "hunk-2",
        expansion: { up: 60, down: 30 }, // higher up, lower down
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].expansion).toEqual({ up: 60, down: 60 }); // max of each
  });

  test("handles hunks in any order", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(40, 5),
        hunkId: "hunk-2",
        expansion: { up: 0, down: 0 },
      },
      {
        hunk: createHunk(10, 5),
        hunkId: "hunk-1",
        expansion: { up: 0, down: 30 },
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    // Should be sorted by line number
    expect(result[0].sourceHunks[0].hunkId).toBe("hunk-1");
    expect(result[0].sourceHunks[1].hunkId).toBe("hunk-2");
  });

  test("handles upward expansion causing overlap", () => {
    const hunks: HunkWithExpansion[] = [
      {
        hunk: createHunk(10, 5),
        hunkId: "hunk-1",
        expansion: { up: 0, down: 0 },
      },
      {
        hunk: createHunk(40, 5),
        hunkId: "hunk-2",
        expansion: { up: 30, down: 0 }, // expand up to line 10 (overlaps!)
      },
    ];

    const result = combineOverlappingHunks(hunks);

    expect(result).toHaveLength(1);
    expect(result[0].combinedId).toBe("hunk-1+hunk-2");
  });
});
