/**
 * Terminal Window Entry Point
 *
 * Separate entry point for pop-out terminal windows.
 * Each window connects to a terminal session via WebSocket.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { TerminalView } from "./components/TerminalView";
import "./styles/globals.css";

// Get workspace ID and optional session ID from query parameters
const params = new URLSearchParams(window.location.search);
const workspaceId = params.get("workspaceId");
const sessionId = params.get("sessionId");

if (!workspaceId) {
  document.body.innerHTML = `
    <div style="color: #f44; padding: 20px; font-family: monospace;">
      Error: No workspace ID provided
    </div>
  `;
} else {
  // Don't use StrictMode for terminal windows to avoid double-mounting issues
  // StrictMode intentionally double-mounts components in dev, which causes
  // race conditions with WebSocket connections and terminal lifecycle
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <TerminalView workspaceId={workspaceId} sessionId={sessionId ?? undefined} visible={true} />
  );
}
