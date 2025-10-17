/**
 * Telemetry module public API
 *
 * This module provides telemetry tracking via PostHog.
 * See payload.ts for all data structures sent to PostHog.
 */

export { initTelemetry, trackEvent, shutdownTelemetry, isTelemetryInitialized } from "./client";
export type { TelemetryEventPayload } from "./payload";
export { getBaseTelemetryProperties, roundToBase2 } from "./utils";
