/**
 * PostHog Telemetry Client
 *
 * Provides a type-safe interface for sending telemetry events to PostHog.
 * All payloads are defined in ./payload.ts for transparency.
 */

import posthog from "posthog-js";
import type { TelemetryEventPayload } from "./payload";

// Default configuration
const DEFAULT_POSTHOG_KEY = "phc_vF1bLfiD5MXEJkxojjsmV5wgpLffp678yhJd3w9Sl4G";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

// Environment variables with fallback to public defaults
function getPosthogConfig(): { key: string; host: string } {
  // In browser/Vite environment, use import.meta.env
  // In test/Node environment, fall back to defaults
  try {
    // Use eval to avoid TypeScript compile-time checking
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const importMeta = new Function("return import.meta")() as
      | { env?: { VITE_PUBLIC_POSTHOG_KEY?: string; VITE_PUBLIC_POSTHOG_HOST?: string } }
      | undefined;
    if (importMeta?.env) {
      return {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        key: importMeta.env.VITE_PUBLIC_POSTHOG_KEY || DEFAULT_POSTHOG_KEY,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        host: importMeta.env.VITE_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
      };
    }
  } catch {
    // import.meta not available (Node/test environment)
  }

  return {
    key: DEFAULT_POSTHOG_KEY,
    host: DEFAULT_POSTHOG_HOST,
  };
}

let isInitialized = false;
let isTesting = false;

/**
 * Check if we're running in a test environment
 */
function isTestEnvironment(): boolean {
  // Check various test environment indicators
  return (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" ||
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.VITEST !== undefined ||
      process.env.TEST_INTEGRATION === "1")
  );
}

/**
 * Initialize the PostHog client
 * Should be called once on app startup
 *
 * Note: Telemetry is automatically disabled in test environments
 */
export function initTelemetry(): void {
  if (isTestEnvironment()) {
    isTesting = true;
    return;
  }

  if (isInitialized) {
    console.warn("Telemetry already initialized");
    return;
  }

  const config = getPosthogConfig();
  posthog.init(config.key, {
    api_host: config.host,
    autocapture: false, // Only send events we explicitly track
    capture_pageview: false, // Not relevant for Electron app
    capture_pageleave: false,
    disable_session_recording: true, // No session recording
    loaded: (ph) => {
      // Identify user with a stable anonymous ID based on machine
      // This allows us to track usage patterns without PII
      ph.identify();
    },
  });

  isInitialized = true;
}

/**
 * Send a telemetry event to PostHog
 * Events are type-safe and must match definitions in payload.ts
 *
 * Note: Events are silently ignored in test environments
 */
export function trackEvent(payload: TelemetryEventPayload): void {
  if (isTesting) {
    // Silently ignore telemetry in tests
    return;
  }

  if (!isInitialized) {
    console.warn("Telemetry not initialized, skipping event:", payload.event);
    return;
  }

  posthog.capture(payload.event, payload.properties);
}

/**
 * Shutdown telemetry and flush any pending events
 * Should be called on app close
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  return new Promise((resolve) => {
    // @ts-expect-error - shutdown exists but may not be in type definitions
    if (typeof posthog.shutdown === "function") {
      // @ts-expect-error - shutdown exists but may not be in type definitions
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      posthog.shutdown(() => {
        isInitialized = false;
        resolve();
      });
    } else {
      isInitialized = false;
      resolve();
    }
  });
}

/**
 * Check if telemetry is initialized
 */
export function isTelemetryInitialized(): boolean {
  return isInitialized;
}
