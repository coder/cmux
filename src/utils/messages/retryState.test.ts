import { describe, it, expect } from "bun:test";
import {
  createFreshRetryState,
  createManualRetryState,
  createFailedRetryState,
  INITIAL_DELAY,
} from "./retryState";

describe("retryState utilities", () => {
  describe("createFreshRetryState", () => {
    it("creates a state with attempt 0 and no error", () => {
      const state = createFreshRetryState();
      expect(state.attempt).toBe(0);
      expect(state.lastError).toBeUndefined();
      expect(state.retryStartTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("createManualRetryState", () => {
    it("preserves attempt counter (critical for backoff)", () => {
      const currentAttempt = 3;
      const state = createManualRetryState(currentAttempt);

      // CRITICAL: Manual retry must preserve attempt counter
      // This ensures exponential backoff continues if the retry fails
      expect(state.attempt).toBe(currentAttempt);
    });

    it("makes retry immediately eligible by backdating retryStartTime", () => {
      const state = createManualRetryState(0);

      // Should be backdated by INITIAL_DELAY to be immediately eligible
      const expectedTime = Date.now() - INITIAL_DELAY;
      expect(state.retryStartTime).toBeLessThanOrEqual(expectedTime);
      expect(state.retryStartTime).toBeGreaterThan(expectedTime - 100); // Allow 100ms tolerance
    });

    it("clears any previous error", () => {
      const state = createManualRetryState(2);
      expect(state.lastError).toBeUndefined();
    });

    it("prevents no-backoff bug: manual retry at attempt 3 should continue backoff progression", () => {
      const currentAttempt = 3;
      const state = createManualRetryState(currentAttempt);

      // Bug scenario: User manually retries after 3 failed attempts
      // Expected: Next auto-retry should wait for 2^3 = 8 seconds
      // Bug (before fix): Next auto-retry would start at attempt 0 (1 second)

      // Verify attempt counter is preserved (not reset to 0)
      expect(state.attempt).toBe(3);

      // Calculate expected backoff if this manual retry fails
      const expectedDelay = INITIAL_DELAY * Math.pow(2, state.attempt);
      expect(expectedDelay).toBe(8000); // 8 seconds for attempt 3

      // If attempt was 0 (the bug), delay would only be 1 second
      const buggyDelay = INITIAL_DELAY * Math.pow(2, 0);
      expect(buggyDelay).toBe(1000);

      // Verify we're NOT creating buggy state
      expect(state.attempt).not.toBe(0);
    });
  });

  describe("createFailedRetryState", () => {
    it("increments attempt counter", () => {
      const error = { type: "unknown" as const, raw: "Test error" };
      const state = createFailedRetryState(2, error);

      expect(state.attempt).toBe(3); // 2 + 1
    });

    it("stores the error for display", () => {
      const error = { type: "api_key_not_found" as const };
      const state = createFailedRetryState(0, error);

      expect(state.lastError).toEqual(error);
    });

    it("updates retryStartTime for backoff calculation", () => {
      const error = { type: "unknown" as const, raw: "Test" };
      const state = createFailedRetryState(1, error);

      expect(state.retryStartTime).toBeLessThanOrEqual(Date.now());
      expect(state.retryStartTime).toBeGreaterThan(Date.now() - 1000); // Within last second
    });
  });

  describe("backoff progression scenario", () => {
    it("maintains exponential backoff through manual retries", () => {
      // Simulate: auto-retry fails 3 times, user clicks manual retry, it fails again

      // Initial auto-retry fails
      let state = createFailedRetryState(0, { type: "unknown" as const, raw: "Error 1" });
      expect(state.attempt).toBe(1);

      // Second auto-retry fails
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error 2" });
      expect(state.attempt).toBe(2);

      // Third auto-retry fails
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error 3" });
      expect(state.attempt).toBe(3);

      // User clicks manual retry - CRITICAL: preserve attempt counter
      state = createManualRetryState(state.attempt);
      expect(state.attempt).toBe(3); // NOT reset to 0

      // Manual retry fails - should increment to 4
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error 4" });
      expect(state.attempt).toBe(4);

      // Next auto-retry should wait 2^4 = 16 seconds
      const delay = INITIAL_DELAY * Math.pow(2, state.attempt);
      expect(delay).toBe(16000);
    });

    it("resets backoff on successful stream start", () => {
      // Simulate: failed several times, then succeeded
      let state = createFailedRetryState(0, { type: "unknown" as const, raw: "Error" });
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error" });
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error" });
      expect(state.attempt).toBe(3);

      // Stream starts successfully - reset everything
      state = createFreshRetryState();
      expect(state.attempt).toBe(0);
      expect(state.lastError).toBeUndefined();

      // Next failure should start fresh at attempt 1
      state = createFailedRetryState(state.attempt, { type: "unknown" as const, raw: "Error" });
      expect(state.attempt).toBe(1);
    });
  });
});
