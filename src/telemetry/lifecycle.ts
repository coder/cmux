/**
 * Telemetry lifecycle tracking
 *
 * Handles app startup events
 */

import { trackEvent, getBaseTelemetryProperties } from "./index";

/**
 * Check if this is the first app launch
 * Uses localStorage to persist flag across sessions
 */
function checkFirstLaunch(): boolean {
  const key = "cmux_first_launch_complete";
  const hasLaunchedBefore = localStorage.getItem(key);

  if (!hasLaunchedBefore) {
    localStorage.setItem(key, "true");
    return true;
  }

  return false;
}

/**
 * Track app startup
 * Should be called once when the app initializes
 */
export function trackAppStarted(): void {
  const isFirstLaunch = checkFirstLaunch();

  console.debug("[Telemetry] trackAppStarted", { isFirstLaunch });

  trackEvent({
    event: "app_started",
    properties: {
      ...getBaseTelemetryProperties(),
      isFirstLaunch,
    },
  });
}
