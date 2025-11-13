import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook to manage terminal WebSocket connection and session lifecycle
 */
export function useTerminalSession(
  workspaceId: string, 
  enabled: boolean,
  terminalSize?: { cols: number; rows: number } | null
) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Create terminal session and WebSocket connection
  useEffect(() => {
    if (!enabled || !terminalSize) {
      return;
    }

    let mounted = true;
    let ws: WebSocket | null = null;
    let createdSessionId: string | null = null; // Track session ID in closure

    const initSession = async () => {
      try {
        
        // Get WebSocket port from backend
        const port = await window.api.terminal.getPort();

        // Create terminal session with actual terminal size
        const session = await window.api.terminal.create({
          workspaceId,
          cols: terminalSize.cols,
          rows: terminalSize.rows,
        });

        if (!mounted) {
          return;
        }

        createdSessionId = session.sessionId; // Store in closure
        setSessionId(session.sessionId);

        // Connect WebSocket
        ws = new WebSocket(`ws://localhost:${port}/terminal`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (mounted && ws) {
            // Send attach message to register this WebSocket with the session
            ws.send(JSON.stringify({
              type: "attach",
              sessionId: createdSessionId,
            }));
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
          console.error(`[Terminal] WebSocket error for session ${createdSessionId}:`, event);
          if (mounted) {
            setError("WebSocket connection failed");
          }
        };
      } catch (err) {
        console.error("[Terminal] Failed to create terminal session:", err);
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

      // Close terminal session using the closure variable
      // This ensures we close the session created by this specific effect run
      if (createdSessionId) {
        void window.api.terminal.close(createdSessionId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, enabled, terminalSize]); // Add terminalSize to deps

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
