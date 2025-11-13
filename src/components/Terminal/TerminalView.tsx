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

  // Keep refs to latest functions so callbacks always use current version
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
          sendInputRef.current(data);
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
      return;
    }
    
    let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    // Use both ResizeObserver (for container changes) and window resize (as backup)
    const handleResize = () => {
      if (fitAddonRef.current && termRef.current) {
        try {
          // Resize terminal UI to fit container immediately for responsive UX
          fitAddonRef.current.fit();
          
          // Get new dimensions
          const { cols, rows } = termRef.current;
          
          // Update state (with stable reference to prevent unnecessary re-renders)
          setTerminalSize(prev => {
            if (prev && prev.cols === cols && prev.rows === rows) {
              return prev;
            }
            return { cols, rows };
          });
          
          // Debounce PTY resize to avoid sending too many resize events during drag
          // This prevents vim cursor position issues from rapid resize signals
          if (resizeTimeoutId !== null) {
            clearTimeout(resizeTimeoutId);
          }
          
          resizeTimeoutId = setTimeout(() => {
            // Send final resize to PTY after user stops resizing
            resizeRef.current(cols, rows);
          }, 100); // 100ms debounce - waits for resize drag to finish before notifying PTY
        } catch (err) {
          console.error("[TerminalView] Error fitting terminal:", err);
        }
      }
    };
    
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    
    // Also listen to window resize as backup
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeTimeoutId !== null) {
        clearTimeout(resizeTimeoutId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
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
