/**
 * Telemetry lifecycle tracking
 * 
 * Handles app startup and shutdown events
 */

import { trackEvent, getBaseTelemetryProperties } from "./index";

let sessionStartTime: number | null = null;
let isFirstLaunch = false;

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
  sessionStartTime = Date.now();
  isFirstLaunch = checkFirstLaunch();
  
  console.debug("[Telemetry] trackAppStarted", { isFirstLaunch });
  
  trackEvent({
    event: "app_started",
    properties: {
      ...getBaseTelemetryProperties(),
      isFirstLaunch,
    },
  });
}

/**
 * Track app shutdown
 * Should be called when the app is closing
 */
export function trackAppClosed(): void {
  if (sessionStartTime === null) {
    console.debug("[Telemetry] trackAppClosed called but no session start time");
    return;
  }
  
  const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
  
  console.debug("[Telemetry] trackAppClosed", { sessionDuration });
  
  trackEvent({
    event: "app_closed",
    properties: {
      ...getBaseTelemetryProperties(),
      sessionDuration,
    },
  });
}

