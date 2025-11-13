/**
 * Terminal Window Entry Point
 * 
 * Separate entry point for pop-out terminal windows.
 * Each window connects to a terminal session via WebSocket.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { TerminalView } from "./components/Terminal/TerminalView";
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
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <TerminalView workspaceId={workspaceId} visible={true} />
    </React.StrictMode>
  );
}
