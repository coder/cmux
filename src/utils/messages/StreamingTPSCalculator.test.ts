import { describe, test, expect } from "bun:test";
import { calculateTPS, calculateTokenCount, type DeltaRecord } from "./StreamingTPSCalculator";

describe("StreamingTPSCalculator", () => {
  describe("calculateTokenCount", () => {
    test("returns 0 for empty deltas", () => {
      expect(calculateTokenCount([])).toBe(0);
    });

    test("sums tokens from all deltas", () => {
      const deltas: DeltaRecord[] = [
        { tokens: 10, timestamp: 1000, type: "text" },
        { tokens: 20, timestamp: 2000, type: "reasoning" },
        { tokens: 30, timestamp: 3000, type: "tool-args" },
      ];
      expect(calculateTokenCount(deltas)).toBe(60);
    });
  });

  describe("calculateTPS", () => {
    test("returns 0 for empty deltas", () => {
      expect(calculateTPS([])).toBe(0);
    });

    test("returns 0 when all deltas are outside window", () => {
      const now = 20000;
      const deltas: DeltaRecord[] = [
        { tokens: 100, timestamp: 1000, type: "text" }, // 19s ago, outside 10s window
      ];
      expect(calculateTPS(deltas, now)).toBe(0);
    });

    test("calculates TPS for deltas within window", () => {
      const now = 10000;
      const deltas: DeltaRecord[] = [
        { tokens: 50, timestamp: 5000, type: "text" }, // 5s ago
        { tokens: 50, timestamp: 7000, type: "text" }, // 3s ago
      ];
      // 100 tokens over 5 seconds = 20 t/s
      expect(calculateTPS(deltas, now)).toBe(20);
    });

    test("filters out deltas outside 10s window", () => {
      const now = 15000;
      const deltas: DeltaRecord[] = [
        { tokens: 100, timestamp: 1000, type: "text" }, // 14s ago, excluded
        { tokens: 50, timestamp: 10000, type: "text" }, // 5s ago, included
      ];
      // Only 50 tokens over 5 seconds = 10 t/s
      expect(calculateTPS(deltas, now)).toBe(10);
    });

    test("handles rapid deltas (high TPS)", () => {
      const now = 2000;
      const deltas: DeltaRecord[] = [
        { tokens: 100, timestamp: 1000, type: "text" },
        { tokens: 100, timestamp: 1500, type: "text" },
      ];
      // 200 tokens over 1 second = 200 t/s
      expect(calculateTPS(deltas, now)).toBe(200);
    });

    test("handles slow deltas (low TPS)", () => {
      const now = 10000;
      const deltas: DeltaRecord[] = [
        { tokens: 10, timestamp: 1000, type: "text" },
        { tokens: 10, timestamp: 9000, type: "text" },
      ];
      // 20 tokens over 9 seconds = ~2 t/s
      expect(calculateTPS(deltas, now)).toBe(2);
    });

    test("includes different delta types", () => {
      const now = 5000;
      const deltas: DeltaRecord[] = [
        { tokens: 30, timestamp: 1000, type: "text" },
        { tokens: 20, timestamp: 2000, type: "reasoning" },
        { tokens: 10, timestamp: 3000, type: "tool-args" },
      ];
      // 60 tokens over 4 seconds = 15 t/s
      expect(calculateTPS(deltas, now)).toBe(15);
    });

    test("returns 0 when time span is zero", () => {
      const now = 1000;
      const deltas: DeltaRecord[] = [
        { tokens: 100, timestamp: 1000, type: "text" }, // Same timestamp as now
      ];
      expect(calculateTPS(deltas, now)).toBe(0);
    });

    test("uses current time by default", () => {
      const now = Date.now();
      const deltas: DeltaRecord[] = [
        { tokens: 50, timestamp: now - 2000, type: "text" }, // 2s ago
      ];
      // Should calculate based on actual current time
      const tps = calculateTPS(deltas);
      expect(tps).toBeGreaterThan(0);
      expect(tps).toBeLessThanOrEqual(50); // Can't be more than 50 tokens / 2s = 25 t/s
    });
  });
});
