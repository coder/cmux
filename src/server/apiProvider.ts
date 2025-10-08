/**
 * API Provider - Detects environment and provides the appropriate API
 * In Electron: uses window.api (from preload script)
 * In Web: uses webApi (HTTP/WebSocket)
 */
import type { IPCApi } from "../types/ipc";
import { webApi } from "./webApi";

// Check if we're running in Electron or Web
const isElectron = typeof window !== "undefined" && "api" in window && window.api !== undefined;

// Platform detection for web mode
const getPlatform = (): string => {
  if (typeof navigator === "undefined") return "unknown";
  
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("win")) return "win32";
  if (ua.includes("linux")) return "linux";
  return "unknown";
};

// Create a mock versions object for web mode
const webVersions = {
  node: "N/A",
  chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || "N/A",
  electron: "N/A (Web Mode)",
};

// Export the appropriate API based on environment
export const api: IPCApi & {
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
} = isElectron
  ? window.api
  : {
      ...webApi,
      platform: getPlatform(),
      versions: webVersions,
    };

export const isWebMode = !isElectron;

// For debugging
if (typeof window !== "undefined") {
  console.log(`Running in ${isElectron ? "Electron" : "Web"} mode`);
  console.log("Platform:", api.platform);
  console.log("Versions:", api.versions);
}
