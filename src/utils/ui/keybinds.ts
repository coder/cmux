/**
 * Centralized keybind utilities for consistent keyboard shortcut handling
 * and OS-aware display across the application.
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
}

/**
 * Detect if running on macOS
 */
export function isMac(): boolean {
  return window.api.platform === "darwin";
}

/**
 * Check if a keyboard event matches a keybind definition.
 * On macOS, ctrl in the definition matches either ctrl OR meta (Cmd) in the event.
 */
export function matchesKeybind(
  event: React.KeyboardEvent | KeyboardEvent,
  keybind: Keybind
): boolean {
  // Check key match (case-insensitive for letters)
  if (event.key.toLowerCase() !== keybind.key.toLowerCase()) {
    return false;
  }

  // On Mac, treat ctrl and meta as equivalent
  const ctrlOrMeta = isMac() ? event.ctrlKey || event.metaKey : event.ctrlKey;

  // Check modifiers
  if (keybind.ctrl && !ctrlOrMeta) return false;
  if (!keybind.ctrl && ctrlOrMeta) return false;

  if (keybind.shift && !event.shiftKey) return false;
  if (!keybind.shift && event.shiftKey) return false;

  if (keybind.alt && !event.altKey) return false;
  if (!keybind.alt && event.altKey) return false;

  // meta is explicit (only check when not handled by ctrl equivalence)
  if (!isMac()) {
    if (keybind.meta && !event.metaKey) return false;
    if (!keybind.meta && event.metaKey) return false;
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
      parts.push("\u2318"); // ⌘ Command
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

  /** Cancel current action / Close modal / Interrupt streaming */
  CANCEL: { key: "Escape" },

  /** Create new workspace for current project */
  NEW_WORKSPACE: { key: "n", ctrl: true },

  /** Jump to bottom of chat */
  JUMP_TO_BOTTOM: { key: "G", shift: true },

  /** Navigate to next workspace in current project */
  NEXT_WORKSPACE: { key: "j", ctrl: true },

  /** Navigate to previous workspace in current project */
  PREV_WORKSPACE: { key: "k", ctrl: true },
} as const;
