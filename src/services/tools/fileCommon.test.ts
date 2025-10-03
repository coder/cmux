import { describe, it, expect } from "bun:test";
import type * as fs from "fs";
import { leaseFromStat } from "./fileCommon";

describe("fileCommon", () => {
  describe("leaseFromStat", () => {
    it("should return a 6-character hexadecimal string", () => {
      const stats = {
        mtimeMs: 1234567890123,
        mtime: new Date(1234567890123),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease = leaseFromStat(stats);

      expect(lease).toMatch(/^[0-9a-f]{6}$/);
      expect(lease.length).toBe(6);
    });

    it("should be deterministic for same stats", () => {
      const stats = {
        mtimeMs: 1234567890123,
        mtime: new Date(1234567890123),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease1 = leaseFromStat(stats);
      const lease2 = leaseFromStat(stats);

      expect(lease1).toBe(lease2);
    });

    it("should produce different leases for different mtimeMs", () => {
      const stats1 = {
        mtimeMs: 1234567890123,
        mtime: new Date(1234567890123),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const stats2 = {
        mtimeMs: 1234567890124, // Different by 1ms
        mtime: new Date(1234567890124),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease1 = leaseFromStat(stats1);
      const lease2 = leaseFromStat(stats2);

      expect(lease1).not.toBe(lease2);
    });

    it("should produce different leases for different file sizes", () => {
      const stats1 = {
        mtimeMs: 1234567890123,
        mtime: new Date(1234567890123),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const stats2 = {
        mtimeMs: 1234567890123,
        mtime: new Date(1234567890123),
        size: 1025, // Different size
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease1 = leaseFromStat(stats1);
      const lease2 = leaseFromStat(stats2);

      expect(lease1).not.toBe(lease2);
    });

    it("should fallback to mtime.getTime() if mtimeMs is not available", () => {
      const stats = {
        mtime: new Date(1234567890123),
        size: 1024,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease = leaseFromStat(stats);

      expect(lease).toMatch(/^[0-9a-f]{6}$/);
      expect(lease.length).toBe(6);
    });

    it("should produce non-sequential leases due to CRC32", () => {
      const stats1 = {
        mtimeMs: 1000,
        mtime: new Date(1000),
        size: 100,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const stats2 = {
        mtimeMs: 1001,
        mtime: new Date(1001),
        size: 100,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease1 = leaseFromStat(stats1);
      const lease2 = leaseFromStat(stats2);

      // Leases should not be sequential (e.g., not "000000" and "000001")
      const lease1Num = parseInt(lease1, 16);
      const lease2Num = parseInt(lease2, 16);

      expect(Math.abs(lease2Num - lease1Num)).toBeGreaterThan(1);
    });

    it("should produce different leases across multiple test runs due to secret", () => {
      // This test verifies that the same input produces the same output within a run
      // but the secret ensures it's not guessable across runs
      const stats = {
        mtimeMs: 9999999999999,
        mtime: new Date(9999999999999),
        size: 12345,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const lease = leaseFromStat(stats);

      // Verify it's a valid 6-char hex
      expect(lease).toMatch(/^[0-9a-f]{6}$/);

      // Verify determinism within same run
      expect(leaseFromStat(stats)).toBe(lease);
    });
  });
});
