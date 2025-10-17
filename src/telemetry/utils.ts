/**
 * Telemetry utility functions
 */

import type { BaseTelemetryProperties } from "./payload";
import { VERSION } from "../version";

/**
 * Get base telemetry properties included with all events
 */
export function getBaseTelemetryProperties(): BaseTelemetryProperties {
  return {
    version: VERSION.git_describe,
    platform: window.api?.platform || "unknown",
    electronVersion: window.api?.versions?.electron || "unknown",
  };
}

/**
 * Round a number to the nearest power of 2 for privacy-preserving metrics
 * E.g., 350 -> 512, 1200 -> 2048
 *
 * This allows numerical analysis while preventing exact values from leaking information
 */
export function roundToBase2(value: number): number {
  if (value <= 0) return 0;
  // Find the next power of 2
  return Math.pow(2, Math.ceil(Math.log2(value)));
}
