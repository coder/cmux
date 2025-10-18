/**
 * Centralized keybind utilities for consistent keyboard shortcut handling
 * and OS-aware display across the application.
 *
 * NOTE: This file is the source of truth for keybind definitions.
 * When adding/modifying keybinds, also update docs/keybinds.md
 */

/**
 * Keybind definition type
 */
export interface Keybind {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  /**
   * On macOS, Ctrl-based shortcuts traditionally use Cmd instead.
   * Use this field to control that behavior:
   * - "either" (default): accept Ctrl or Cmd
   * - "command": require Cmd specifically
   * - "control": require the Control key specifically
   */
  macCtrlBehavior?: "either" | "command" | "control";
}

/**
 * Detect if running on macOS
 */
export function isMac(): boolean {
  try {
    if (typeof window === "undefined") return false;
    interface MinimalAPI {
      platform: string;
    }
    const api = (window as unknown as { api?: MinimalAPI }).api;
    return api?.platform === "darwin";
  } catch {
    return false;
  }
}

/**
 * Check if a keyboard event matches a keybind definition.
 * On macOS, ctrl in the definition defaults to matching Ctrl or Cmd unless overridden.
 */
export function matchesKeybind(
  event: React.KeyboardEvent | KeyboardEvent,
  keybind: Keybind
): boolean {
  // Check key match (case-insensitive for letters)
  if (event.key.toLowerCase() !== keybind.key.toLowerCase()) {
    return false;
  }

  const onMac = isMac();
  const macCtrlBehavior = keybind.macCtrlBehavior ?? "either";
  const ctrlPressed = event.ctrlKey;
  const metaPressed = event.metaKey;

  let ctrlRequired = false;
  let ctrlAllowed = false;
  let metaRequired = keybind.meta ?? false;
  let metaAllowed = metaRequired;

  if (keybind.ctrl) {
    if (onMac) {
      switch (macCtrlBehavior) {
        case "control": {
          ctrlRequired = true;
          ctrlAllowed = true;
          // Only allow Cmd if explicitly requested via meta flag
          break;
        }
        case "command": {
          metaRequired = true;
          metaAllowed = true;
          ctrlAllowed = true;
          break;
        }
        case "either": {
          ctrlAllowed = true;
          metaAllowed = true;
          if (!ctrlPressed && !metaPressed) return false;
          break;
        }
      }
    } else {
      ctrlRequired = true;
      ctrlAllowed = true;
    }
  } else {
    ctrlAllowed = false;
  }

  if (ctrlRequired && !ctrlPressed) return false;
  if (!ctrlAllowed && ctrlPressed) return false;

  if (keybind.shift && !event.shiftKey) return false;
  if (!keybind.shift && event.shiftKey) return false;

  if (keybind.alt && !event.altKey) return false;
  if (!keybind.alt && event.altKey) return false;

  if (metaRequired && !metaPressed) return false;

  if (!metaAllowed) {
    // If Cmd is allowed implicitly via ctrl behavior, mark it now
    if (onMac && keybind.ctrl && macCtrlBehavior !== "control") {
      metaAllowed = true;
    }
  }

  if (!metaAllowed && metaPressed) {
    return false;
  }

  return true;
}

/**
 * Check if the event target is an editable element (input, textarea, contentEditable).
 * Used to prevent global keyboard shortcuts from interfering with text input.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.contentEditable === "true";
}

/**
 * Format a keybind for display to users.
 * Returns Mac-style symbols on macOS, or Windows-style text elsewhere.
 */
export function formatKeybind(keybind: Keybind): string {
  const parts: string[] = [];

  if (isMac()) {
    // Mac-style formatting with symbols (using Unicode escapes for safety)
    // For ctrl on Mac, we actually mean Cmd in most cases since matcher treats them as equivalent
    if (keybind.ctrl && !keybind.meta) {
      const macCtrlBehavior = keybind.macCtrlBehavior ?? "either";
      if (macCtrlBehavior === "control") {
        parts.push("\u2303"); // ⌃ Control
      } else {
        parts.push("\u2318"); // ⌘ Command
      }
    } else if (keybind.ctrl) {
      parts.push("\u2303"); // ⌃ Control
    }
    if (keybind.alt) parts.push("\u2325"); // ⌥ Option
    if (keybind.shift) parts.push("\u21E7"); // ⇧ Shift
    if (keybind.meta) parts.push("\u2318"); // ⌘ Command
  } else {
    // Windows/Linux-style formatting with text
    if (keybind.ctrl) parts.push("Ctrl");
    if (keybind.alt) parts.push("Alt");
    if (keybind.shift) parts.push("Shift");
    if (keybind.meta) parts.push("Meta");
  }

  // Add the key (capitalize single letters)
  const key = keybind.key.length === 1 ? keybind.key.toUpperCase() : keybind.key;
  parts.push(key);

  return isMac() ? parts.join("\u00B7") : parts.join("+"); // · on Mac, + elsewhere
}

/**
 * Centralized registry of application keybinds.
 * Single source of truth for all keyboard shortcuts.
 * In general we try to use shortcuts the user would naturally expect.
 * We also like vim keybinds.
 */
export const KEYBINDS = {
  /** Toggle between Plan and Exec modes */
  TOGGLE_MODE: { key: "M", ctrl: true, shift: true },

  /** Send message / Submit form */
  SEND_MESSAGE: { key: "Enter" },

  /** Insert newline in text input */
  NEW_LINE: { key: "Enter", shift: true },

  /** Cancel current action / Close modal (excludes stream interruption) */
  CANCEL: { key: "Escape" },

  /** Cancel editing message (exit edit mode) */
  CANCEL_EDIT: { key: "q", ctrl: true, macCtrlBehavior: "control" },

  /** Interrupt active stream (destructive - stops AI generation) */
  INTERRUPT_STREAM: { key: "c", ctrl: true, macCtrlBehavior: "control" },

  /** Accept partial compaction early (adds [truncated] sentinel) */
  ACCEPT_EARLY_COMPACTION: { key: "a", ctrl: true, macCtrlBehavior: "control" },

  /** Focus chat input */
  FOCUS_INPUT_I: { key: "i" },

  /** Focus chat input (alternate) */
  FOCUS_INPUT_A: { key: "a" },

  /** Create new workspace for current project */
  NEW_WORKSPACE: { key: "n", ctrl: true },

  /** Jump to bottom of chat */
  JUMP_TO_BOTTOM: { key: "G", shift: true },

  /** Navigate to next workspace in current project */
  NEXT_WORKSPACE: { key: "j", ctrl: true },

  /** Navigate to previous workspace in current project */
  PREV_WORKSPACE: { key: "k", ctrl: true },

  /** Toggle sidebar visibility */
  // VS Code-style quick toggle
  // macOS: Cmd+P, Win/Linux: Ctrl+P
  TOGGLE_SIDEBAR: { key: "P", ctrl: true },

  /** Open model selector */
  OPEN_MODEL_SELECTOR: { key: "/", ctrl: true },

  /** Open workspace in terminal */
  // macOS: Cmd+T, Win/Linux: Ctrl+T
  OPEN_TERMINAL: { key: "T", ctrl: true },

  /** Open Command Palette */
  // VS Code-style palette
  // macOS: Cmd+Shift+P, Win/Linux: Ctrl+Shift+P
  OPEN_COMMAND_PALETTE: { key: "P", ctrl: true, shift: true },

  /** Toggle thinking level between off and last-used value for current model */
  // Saves/restores thinking level per model (defaults to "medium" if not found)
  // macOS: Cmd+Shift+T, Win/Linux: Ctrl+Shift+T
  TOGGLE_THINKING: { key: "T", ctrl: true, shift: true },

  /** Focus chat input from anywhere */
  // Works even when focus is already in an input field
  // macOS: Cmd+I, Win/Linux: Ctrl+I
  FOCUS_CHAT: { key: "I", ctrl: true },

  /** Switch to Costs tab in right sidebar */
  // macOS: Cmd+1, Win/Linux: Ctrl+1
  COSTS_TAB: { key: "1", ctrl: true, description: "Costs tab" },

  /** Switch to Review tab in right sidebar */
  // macOS: Cmd+2, Win/Linux: Ctrl+2
  REVIEW_TAB: { key: "2", ctrl: true, description: "Review tab" },
} as const;
