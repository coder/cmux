/**
 * Terminal Window Entry Point
 * 
 * Separate entry point for pop-out terminal windows.
 * Each window connects to a terminal session via WebSocket.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";

// Get workspace ID from query parameter
const params = new URLSearchParams(window.location.search);
const workspaceId = params.get("workspaceId");

if (!workspaceId) {
  document.body.innerHTML = `
    <div style="color: #f44; padding: 20px; font-family: monospace;">
      Error: No workspace ID provided
    </div>
  `;
} else {
  // Dynamically import TerminalView to avoid build issues with ghostty-web in production
  // TODO: Remove this workaround once ghostty-web is published to npm with built dist/
  void (async () => {
    try {
      const { TerminalView } = await import("./components/Terminal/TerminalView");
      ReactDOM.createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
          <TerminalView workspaceId={workspaceId} visible={true} />
        </React.StrictMode>
      );
    } catch (err) {
      document.body.innerHTML = `
        <div style="color: #f44; padding: 20px; font-family: monospace;">
          Error loading terminal: ${err instanceof Error ? err.message : String(err)}
          <br/><br/>
          This is likely due to missing ghostty-web build artifacts.
          <br/>
          Terminal windows are currently only available in development mode.
        </div>
      `;
    }
  })();
}
