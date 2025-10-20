import { groupDiffLines } from "./diffChunking";

describe("groupDiffLines", () => {
  it("should group consecutive adds into a chunk", () => {
    const lines = ["+line1", "+line2", "+line3"];
    const chunks = groupDiffLines(lines, 1, 1);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("add");
    expect(chunks[0].lines).toEqual(["line1", "line2", "line3"]);
    expect(chunks[0].lineNumbers).toEqual([1, 2, 3]);
  });

  it("should group consecutive removes into a chunk", () => {
    const lines = ["-line1", "-line2"];
    const chunks = groupDiffLines(lines, 10, 1);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("remove");
    expect(chunks[0].lines).toEqual(["line1", "line2"]);
    expect(chunks[0].lineNumbers).toEqual([10, 11]);
  });

  it("should split chunks on type change", () => {
    const lines = ["+added", " context", "-removed"];
    const chunks = groupDiffLines(lines, 1, 1);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].type).toBe("add");
    expect(chunks[0].lines).toEqual(["added"]);
    expect(chunks[1].type).toBe("context");
    expect(chunks[1].lines).toEqual(["context"]);
    expect(chunks[2].type).toBe("remove");
    expect(chunks[2].lines).toEqual(["removed"]);
  });

  it("should handle header lines and reset numbering", () => {
    const lines = ["+line1", "@@ -10,3 +20,4 @@", "+line2"];
    const chunks = groupDiffLines(lines, 1, 1);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe("add");
    expect(chunks[0].lineNumbers).toEqual([1]); // First chunk starts at newStart=1
    expect(chunks[1].type).toBe("add");
    expect(chunks[1].lineNumbers).toEqual([20]); // Second chunk resets to header's +20
  });

  it("should track line numbers correctly for mixed diff", () => {
    const lines = [" context1", "+added", " context2", "-removed"];
    const chunks = groupDiffLines(lines, 5, 10);

    expect(chunks).toHaveLength(4);

    // Context line increments both old and new
    expect(chunks[0].lineNumbers).toEqual([5]);

    // Add line increments only new
    expect(chunks[1].lineNumbers).toEqual([11]);

    // Context after add
    expect(chunks[2].lineNumbers).toEqual([6]);

    // Remove after context increments only old
    expect(chunks[3].lineNumbers).toEqual([7]);
  });

  it("should handle empty input", () => {
    const chunks = groupDiffLines([], 1, 1);
    expect(chunks).toHaveLength(0);
  });

  it("should preserve original index for each line", () => {
    const lines = ["+line1", "+line2", " context"];
    const chunks = groupDiffLines(lines, 1, 1);

    expect(chunks[0].startIndex).toBe(0);
    expect(chunks[1].startIndex).toBe(2);
  });
});
