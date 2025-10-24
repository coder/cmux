import { describe, it, expect } from "bun:test";
import { calculateUpwardExpansion, calculateDownwardExpansion } from "./readFileLines";

describe("calculateUpwardExpansion", () => {
  it("returns cumulative range from start to hunk", () => {
    const oldStart = 100;

    // First expansion: 30 lines
    const exp1 = calculateUpwardExpansion(oldStart, 30);
    expect(exp1.startLine).toBe(70);
    expect(exp1.endLine).toBe(99);
    expect(exp1.numLines).toBe(30);

    // Second expansion: 60 lines total (cumulative)
    const exp2 = calculateUpwardExpansion(oldStart, 60);
    expect(exp2.startLine).toBe(40);
    expect(exp2.endLine).toBe(99); // Same endLine - always up to hunk
    expect(exp2.numLines).toBe(60);

    // Third expansion: 90 lines total (cumulative)
    const exp3 = calculateUpwardExpansion(oldStart, 90);
    expect(exp3.startLine).toBe(10);
    expect(exp3.endLine).toBe(99);
    expect(exp3.numLines).toBe(90);
  });

  it("stops at line 1 (beginning of file)", () => {
    const oldStart = 20;
    const exp = calculateUpwardExpansion(oldStart, 100);

    expect(exp.startLine).toBe(1); // Can't go below 1
    expect(exp.endLine).toBe(19);
    expect(exp.numLines).toBe(19); // Less than requested 100
  });

  it("returns zero lines when hunk is at line 1", () => {
    const oldStart = 1;
    const exp = calculateUpwardExpansion(oldStart, 30);

    expect(exp.startLine).toBe(1);
    expect(exp.endLine).toBe(0); // endLine < startLine
    expect(exp.numLines).toBe(0); // No lines before hunk
  });

  it("handles expansion equal to available lines", () => {
    const oldStart = 31;
    const exp = calculateUpwardExpansion(oldStart, 30);

    expect(exp.startLine).toBe(1);
    expect(exp.endLine).toBe(30);
    expect(exp.numLines).toBe(30);
  });
});

describe("calculateDownwardExpansion", () => {
  it("returns cumulative range from hunk end downward", () => {
    const oldStart = 100;
    const oldLines = 10; // Hunk is lines 100-109

    // First expansion: 30 lines
    const exp1 = calculateDownwardExpansion(oldStart, oldLines, 30);
    expect(exp1.startLine).toBe(110); // Right after hunk
    expect(exp1.endLine).toBe(139);
    expect(exp1.numLines).toBe(30);

    // Second expansion: 60 lines total (cumulative)
    const exp2 = calculateDownwardExpansion(oldStart, oldLines, 60);
    expect(exp2.startLine).toBe(110); // Same startLine - always after hunk
    expect(exp2.endLine).toBe(169);
    expect(exp2.numLines).toBe(60);

    // Third expansion: 90 lines total (cumulative)
    const exp3 = calculateDownwardExpansion(oldStart, oldLines, 90);
    expect(exp3.startLine).toBe(110);
    expect(exp3.endLine).toBe(199);
    expect(exp3.numLines).toBe(90);
  });

  it("handles single-line hunks", () => {
    const oldStart = 50;
    const oldLines = 1;

    const exp = calculateDownwardExpansion(oldStart, oldLines, 30);
    expect(exp.startLine).toBe(51);
    expect(exp.endLine).toBe(80);
    expect(exp.numLines).toBe(30);
  });

  it("handles large hunks", () => {
    const oldStart = 100;
    const oldLines = 50; // Hunk is lines 100-149

    const exp = calculateDownwardExpansion(oldStart, oldLines, 30);
    expect(exp.startLine).toBe(150);
    expect(exp.endLine).toBe(179);
    expect(exp.numLines).toBe(30);
  });
});
