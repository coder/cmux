/**
 * Terminal session types
 */

export interface TerminalSession {
  sessionId: string;
  workspaceId: string;
  cols: number;
  rows: number;
}

export interface TerminalCreateParams {
  workspaceId: string;
  cols: number;
  rows: number;
}

export interface TerminalResizeParams {
  sessionId: string;
  cols: number;
  rows: number;
}

/**
 * WebSocket message types for terminal communication
 */
export type TerminalMessage =
  | {
      type: "attach";
      sessionId: string;
    }
  | {
      type: "input";
      sessionId: string;
      data: string;
    }
  | {
      type: "resize";
      sessionId: string;
      cols: number;
      rows: number;
    };

export type TerminalServerMessage =
  | {
      type: "output";
      sessionId: string;
      data: string;
    }
  | {
      type: "exit";
      sessionId: string;
      exitCode: number;
    };
