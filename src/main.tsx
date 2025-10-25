import React from "react";
import ReactDOM from "react-dom/client";
import { AppLoader } from "./components/AppLoader";
import { initTelemetry, trackAppStarted } from "./telemetry";

// Shims the `window.api` object with the browser API.
// This occurs if we are not running in Electron.
import "./browser/api";

// Initialize telemetry on app startup
initTelemetry();
trackAppStarted();

// Global error handlers for renderer process
// These catch errors that escape the ErrorBoundary
window.addEventListener("error", (event) => {
  console.error("Uncaught error in renderer:", event.error);
  console.error("Error details:", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection in renderer:", event.reason);
  console.error("Promise:", event.promise);
  if (event.reason instanceof Error) {
    console.error("Stack:", event.reason.stack);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLoader />
  </React.StrictMode>
);

// Register service worker for PWA support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
      })
      .catch((error) => {
        console.log("Service Worker registration failed:", error);
      });
  });
}
