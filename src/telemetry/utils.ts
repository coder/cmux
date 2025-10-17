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
 * Bucket message length for privacy
 */
export function getMessageLengthBucket(length: number): string {
  if (length < 100) return "<100";
  if (length < 500) return "100-500";
  if (length < 1000) return "500-1000";
  return ">1000";
}

/**
 * Extract provider name from model string
 * E.g., "anthropic/claude-3-5-sonnet" -> "anthropic"
 */
export function extractProvider(model: string): string {
  const parts = model.split("/");
  return parts.length > 1 ? parts[0] : "unknown";
}
