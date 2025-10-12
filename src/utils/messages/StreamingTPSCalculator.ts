/**
 * StreamingTPSCalculator - Calculates tokens-per-second from timestamped delta records
 *
 * Maintains a sliding window of recent deltas and calculates TPS based on time span.
 * Designed to be independently testable from the main aggregator.
 */

export interface DeltaRecord {
  tokens: number;
  timestamp: number;
  type: "text" | "reasoning" | "tool-args";
}

const TPS_WINDOW_MS = 10000; // 10 second trailing window

/**
 * Calculate tokens-per-second from a history of delta records
 * Uses a 10-second trailing window
 */
export function calculateTPS(deltas: DeltaRecord[], now: number = Date.now()): number {
  if (deltas.length === 0) return 0;

  // Filter to deltas within the trailing window
  const windowStart = now - TPS_WINDOW_MS;
  const recentDeltas = deltas.filter((d) => d.timestamp >= windowStart);

  if (recentDeltas.length === 0) return 0;

  // Calculate total tokens in window
  const totalTokens = recentDeltas.reduce((sum, d) => sum + (d.tokens || 0), 0);

  // Calculate time span from first delta in window to now
  const timeSpanMs = now - recentDeltas[0].timestamp;
  const timeSpanSec = timeSpanMs / 1000;

  // Avoid division by zero
  if (timeSpanSec <= 0) return 0;

  return Math.round(totalTokens / timeSpanSec);
}

/**
 * Calculate cumulative token count from delta records
 */
export function calculateTokenCount(deltas: DeltaRecord[]): number {
  if (!deltas || deltas.length === 0) return 0;
  return deltas.reduce((sum, d) => sum + (d.tokens || 0), 0);
}
