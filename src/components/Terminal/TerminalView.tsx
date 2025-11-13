import { useRef, useEffect, useState } from "react";
import { Terminal, FitAddon } from "ghostty-web";
import { useTerminalSession } from "@/hooks/useTerminalSession";

interface TerminalViewProps {
  workspaceId: string;
  visible: boolean;
}

export function TerminalView({ workspaceId, visible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalSize, setTerminalSize] = useState<{ cols: number; rows: number } | null>(null);

  const { connected, sessionId, wsRef, sendInput, resize, error: sessionError } = useTerminalSession(
    workspaceId,
    visible,
    terminalSize
  );

  // Keep refs to latest functions so onData callback always uses current version
  const sendInputRef = useRef(sendInput);
  const resizeRef = useRef(resize);
  
  useEffect(() => {
    sendInputRef.current = sendInput;
    resizeRef.current = resize;
  }, [sendInput, resize]);

  // Initialize terminal when visible
  useEffect(() => {
    if (!containerRef.current || !visible) {
      return;
    }

    let terminal: Terminal | null = null;

    const initTerminal = async () => {
      try {
        console.log("[TerminalView] Initializing terminal...");
        terminal = new Terminal({
          fontSize: 13,
          fontFamily: "Monaco, Menlo, 'Courier New', monospace",
          cursorBlink: true,
          theme: {
            background: "#1e1e1e",
            foreground: "#d4d4d4",
            cursor: "#d4d4d4",
            cursorAccent: "#1e1e1e",
            selectionBackground: "#264f78",
            black: "#000000",
            red: "#cd3131",
            green: "#0dbc79",
            yellow: "#e5e510",
            blue: "#2472c8",
            magenta: "#bc3fbc",
            cyan: "#11a8cd",
            white: "#e5e5e5",
            brightBlack: "#666666",
            brightRed: "#f14c4c",
            brightGreen: "#23d18b",
            brightYellow: "#f5f543",
            brightBlue: "#3b8eea",
            brightMagenta: "#d670d6",
            brightCyan: "#29b8db",
            brightWhite: "#ffffff",
          },
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        await terminal.open(containerRef.current!);
        fitAddon.fit();

        const { cols, rows } = terminal;
        
        // Set terminal size so PTY session can be created with matching dimensions
        // Use stable object reference to prevent unnecessary effect re-runs
        setTerminalSize(prev => {
          if (prev && prev.cols === cols && prev.rows === rows) {
            return prev;
          }
          return { cols, rows };
        });
        
        // User input → WebSocket (use ref to always get latest sendInput)
        terminal.onData((data: string) => {
          console.log("[TerminalView] onData:", JSON.stringify(data));
          sendInputRef.current(data);
        });

        // Handle resize (use ref to always get latest resize)
        terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          // Use stable object reference to prevent unnecessary effect re-runs
          setTerminalSize(prev => {
            if (prev && prev.cols === cols && prev.rows === rows) {
              return prev;
            }
            return { cols, rows };
          });
          resizeRef.current(cols, rows);
        });

        termRef.current = terminal;
        fitAddonRef.current = fitAddon;
        setTerminalReady(true);
      } catch (err) {
        console.error("Failed to initialize terminal:", err);
        setTerminalError(err instanceof Error ? err.message : "Failed to initialize terminal");
      }
    };

    void initTerminal();

    return () => {
      if (terminal) {
        terminal.dispose();
      }
      termRef.current = null;
      fitAddonRef.current = null;
      setTerminalReady(false);
      setTerminalSize(null);
    };
    // Note: sendInput and resize are intentionally not in deps
    // They're used in callbacks, not during effect execution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, workspaceId]);

  // WebSocket output → Terminal
  useEffect(() => {
    const ws = wsRef.current;
    const term = termRef.current;
    
    if (!ws || !term || !connected || !terminalReady) {
      return;
    }
    

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        
        // Use termRef.current to get the latest terminal instance
        const currentTerm = termRef.current;
        if (!currentTerm) {
          return;
        }
        
        if (msg.type === "output") {
          currentTerm.write(msg.data);
        } else if (msg.type === "exit") {
          currentTerm.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        }
      } catch (err) {
        console.error("[TerminalView] Error handling WebSocket message:", err);
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, terminalReady, sessionId]);

  // Resize on container size change
  useEffect(() => {
    if (!visible || !fitAddonRef.current || !containerRef.current || !termRef.current) {
      console.log("[TerminalView] Resize observer not set up:", { 
        visible, 
        hasFitAddon: !!fitAddonRef.current, 
        hasContainer: !!containerRef.current,
        hasTerminal: !!termRef.current 
      });
      return;
    }

    console.log("[TerminalView] Setting up ResizeObserver");
    const resizeObserver = new ResizeObserver(() => {
      console.log("[TerminalView] Container resized, calling fit()");
      if (fitAddonRef.current && termRef.current) {
        fitAddonRef.current.fit();
        console.log("[TerminalView] Fit complete, new size:", termRef.current.cols, "x", termRef.current.rows);
      }
      // Terminal will fire onResize event which will update terminalSize and propagate to PTY
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      console.log("[TerminalView] Disconnecting ResizeObserver");
      resizeObserver.disconnect();
    };
  }, [visible, terminalReady]); // terminalReady ensures ResizeObserver is set up after terminal is initialized

  if (!visible) return null;

  const errorMessage = terminalError || sessionError;

  return (
    <div className="terminal-view" style={{ 
      width: "100%", 
      height: "100%",
      backgroundColor: "#1e1e1e"
    }}>
      {errorMessage && (
        <div className="p-2 bg-red-900/20 text-red-400 text-sm border-b border-red-900/30">
          Terminal Error: {errorMessage}
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-container"
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
