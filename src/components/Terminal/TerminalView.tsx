import { useRef, useEffect, useState } from "react";
// @ts-expect-error - ghostty-wasm types not yet published
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

  const { connected, wsRef, sendInput, resize, error: sessionError } = useTerminalSession(
    workspaceId,
    visible
  );

  // Initialize terminal when visible
  useEffect(() => {
    if (!containerRef.current || !visible) return;

    let terminal: Terminal | null = null;

    const initTerminal = async () => {
      try {
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

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        await terminal.open(containerRef.current!);
        fitAddon.fit();

        // User input → WebSocket
        terminal.onData(sendInput);

        // Handle resize
        terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          resize(cols, rows);
        });

        termRef.current = terminal;
        fitAddonRef.current = fitAddon;
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
    };
  }, [visible, sendInput, resize]);

  // WebSocket output → Terminal
  useEffect(() => {
    if (!wsRef.current || !termRef.current) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "output") {
          termRef.current?.write(msg.data);
        } else if (msg.type === "exit") {
          termRef.current?.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
        }
      } catch (err) {
        console.error("Error handling WebSocket message:", err);
      }
    };

    wsRef.current.addEventListener("message", handleMessage);
    return () => {
      wsRef.current?.removeEventListener("message", handleMessage);
    };
  }, [connected, wsRef]);

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
