import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api, isWebMode } from "./server/apiProvider";

// Inject API into window if running in web mode
if (isWebMode && typeof window !== "undefined") {
  (window as any).api = api;
}

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
    <App />
  </React.StrictMode>
);
