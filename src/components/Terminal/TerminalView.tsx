import { useRef, useEffect, useState } from "react";
import { Terminal, FitAddon } from "ghostty-wasm";
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

  const { connected, wsRef, sendInput, resize, error: sessionError } = useTerminalSession(
    workspaceId,
    visible
  );

  // Initialize terminal when visible
  useEffect(() => {
    if (!containerRef.current || !visible) {
      console.log("[TerminalView] Skipping init - containerRef:", !!containerRef.current, "visible:", visible);
      return;
    }

    console.log("[TerminalView] Initializing terminal for workspace:", workspaceId);
    let terminal: Terminal | null = null;

    const initTerminal = async () => {
      try {
        console.log("[TerminalView] Creating Terminal instance...");
        terminal = new Terminal({
          wasmPath: "/src/assets/ghostty-vt.wasm",
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

        console.log("[TerminalView] Terminal instance created, loading FitAddon...");
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        console.log("[TerminalView] Opening terminal in DOM...");
        await terminal.open(containerRef.current!);
        fitAddon.fit();

        console.log("[TerminalView] Terminal mounted and fitted");
        // User input → WebSocket
        terminal.onData(sendInput);

        // Handle resize
        terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          resize(cols, rows);
        });

        termRef.current = terminal;
        fitAddonRef.current = fitAddon;
        setTerminalReady(true);
        console.log("[TerminalView] Terminal ready for WebSocket data");
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
    };
  }, [visible, sendInput, resize]);

  // WebSocket output → Terminal
  useEffect(() => {
    const ws = wsRef.current;
    const term = termRef.current;
    
    if (!ws || !term || !connected || !terminalReady) {
      console.log("[TerminalView] WebSocket effect - ws:", !!ws, "term:", !!term, "connected:", connected, "terminalReady:", terminalReady);
      return;
    }

    console.log("[TerminalView] Setting up WebSocket message handler");
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        console.log("[TerminalView] Received WebSocket message:", msg.type, msg.data?.length || 0, "bytes");
        if (msg.type === "output") {
          term.write(msg.data);
        } else if (msg.type === "exit") {
          term.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        }
      } catch (err) {
        console.error("Error handling WebSocket message:", err);
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => {
      console.log("[TerminalView] Removing WebSocket message handler");
      ws.removeEventListener("message", handleMessage);
    };
  }, [connected, terminalReady]);

  // Resize on container size change
  useEffect(() => {
    if (!visible || !fitAddonRef.current || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [visible]);

  if (!visible) return null;

  const errorMessage = terminalError || sessionError;

  return (
    <div className="terminal-view border-t border-border bg-background">
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
          height: errorMessage ? "calc(300px - 2rem)" : "300px",
          padding: "4px",
        }}
      />
    </div>
  );
}
