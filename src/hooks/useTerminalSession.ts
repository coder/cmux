import { useState, useEffect, useRef, useCallback } from "react";
import { log } from "@/services/log";

/**
 * Hook to manage terminal WebSocket connection and session lifecycle
 */
export function useTerminalSession(workspaceId: string, enabled: boolean) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Create terminal session and WebSocket connection
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let mounted = true;
    let ws: WebSocket | null = null;

    const initSession = async () => {
      try {
        // Get WebSocket port from backend
        const port = await window.api.terminal.getPort();

        // Create terminal session
        const session = await window.api.terminal.create({
          workspaceId,
          cols: 80,
          rows: 24,
        });

        if (!mounted) return;

        setSessionId(session.sessionId);

        // Connect WebSocket
        ws = new WebSocket(`ws://localhost:${port}/terminal`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (mounted) {
            setConnected(true);
            setError(null);
          }
        };

        ws.onclose = () => {
          if (mounted) {
            setConnected(false);
          }
        };

        ws.onerror = (event) => {
          console.error("WebSocket error:", event);
          if (mounted) {
            setError("WebSocket connection failed");
          }
        };
      } catch (err) {
        console.error("Failed to create terminal session:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to create terminal");
        }
      }
    };

    void initSession();

    return () => {
      mounted = false;
      
      // Close WebSocket
      if (ws) {
        ws.close();
      }

      // Close terminal session
      if (sessionId) {
        void window.api.terminal.close(sessionId);
      }
    };
  }, [workspaceId, enabled, sessionId]);

  // Send input to terminal
  const sendInput = useCallback(
    (data: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessionId) {
        wsRef.current.send(
          JSON.stringify({
            type: "input",
            sessionId,
            data,
          })
        );
      }
    },
    [sessionId]
  );

  // Resize terminal
  const resize = useCallback(
    (cols: number, rows: number) => {
      if (sessionId) {
        void window.api.terminal.resize({ sessionId, cols, rows });
      }
    },
    [sessionId]
  );

  return {
    connected,
    sessionId,
    error,
    wsRef,
    sendInput,
    resize,
  };
}
