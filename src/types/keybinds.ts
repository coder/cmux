/**
 * Type definitions for customizable F-key keybinds
 */

export interface SendMessageAction {
  type: "send_message";
  message: string;
}

// Union type to easily add more action types in the future
export type KeybindAction = SendMessageAction;

export interface Keybind {
  key: string; // "F1" through "F10"
  action: KeybindAction;
}

export type KeybindsConfig = Keybind[];

