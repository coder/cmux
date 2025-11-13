/**
 * Type declarations for ghostty-web
 * 
 * Temporary type declarations until ghostty-web is published to npm with built types.
 * Based on the ghostty-web library's TypeScript source.
 */

declare module "ghostty-web" {
  export interface TerminalTheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
  }

  export interface TerminalOptions {
    fontSize?: number;
    fontFamily?: string;
    cursorBlink?: boolean;
    theme?: TerminalTheme;
    wasmPath?: string;
  }

  export class Terminal {
    constructor(options?: TerminalOptions);
    open(container: HTMLElement): Promise<void>;
    dispose(): void;
    write(data: string): void;
    onData(callback: (data: string) => void): void;
    onResize(callback: (size: { cols: number; rows: number }) => void): void;
    loadAddon(addon: unknown): void;
    readonly cols: number;
    readonly rows: number;
  }

  export class FitAddon {
    constructor();
    fit(): void;
  }
}
