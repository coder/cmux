/**
 * KeybindService - Manages F-key macro keybinds
 *
 * Handles loading and saving keybinds from ~/.cmux/keybinds.jsonc
 * Similar pattern to how Config class handles providers.jsonc
 */

import * as fs from "fs";
import * as path from "path";
import * as jsonc from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";
import type { KeybindsConfig, Keybind } from "@/types/keybinds";

export class KeybindService {
  private readonly keybindsFile: string;

  constructor(rootDir: string) {
    this.keybindsFile = path.join(rootDir, "keybinds.jsonc");
  }

  /**
   * Load keybinds from keybinds.jsonc
   * Returns empty array if file doesn't exist or can't be parsed
   */
  loadKeybinds(): KeybindsConfig {
    try {
      if (fs.existsSync(this.keybindsFile)) {
        const data = fs.readFileSync(this.keybindsFile, "utf-8");
        const parsed = jsonc.parse(data) as unknown;

        if (Array.isArray(parsed)) {
          // Validate each keybind has required structure
          return parsed.filter(this.isValidKeybind);
        }
      }
    } catch (error) {
      console.error("Error loading keybinds:", error);
    }

    return [];
  }

  /**
   * Save keybinds to keybinds.jsonc
   * Writes atomically to prevent corruption
   */
  saveKeybinds(keybinds: KeybindsConfig): void {
    try {
      const dir = path.dirname(this.keybindsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Format with comments for user guidance
      const content = this.formatKeybindsWithComments(keybinds);
      writeFileAtomic.sync(this.keybindsFile, content);
    } catch (error) {
      console.error("Error saving keybinds:", error);
      throw error;
    }
  }

  /**
   * Type guard to validate keybind structure
   */
  private isValidKeybind(item: unknown): item is Keybind {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const candidate = item as Record<string, unknown>;

    // Validate key field
    if (typeof candidate.key !== "string") {
      return false;
    }

    // Validate action field
    if (typeof candidate.action !== "object" || candidate.action === null) {
      return false;
    }

    const action = candidate.action as Record<string, unknown>;

    // Currently only support send_message action
    if (action.type === "send_message") {
      return typeof action.message === "string";
    }

    return false;
  }

  /**
   * Format keybinds config with helpful comments
   */
  private formatKeybindsWithComments(keybinds: KeybindsConfig): string {
    const header = [
      "// Cmux F-Key Keybinds Configuration",
      "// This file defines custom macros for F1-F10 keys",
      "//",
      "// Each keybind has:",
      '//   - key: The F-key name (e.g., "F1", "F2", ...)',
      "//   - action: What happens when the key is pressed",
      "//",
      "// Supported actions:",
      '//   - send_message: Send a message to the AI (supports slash commands)',
      "//",
      "// Examples:",
      '//   { "key": "F1", "action": { "type": "send_message", "message": "/edit Add tests" } }',
      '//   { "key": "F2", "action": { "type": "send_message", "message": "continue" } }',
      "",
    ].join("\n");

    return header + JSON.stringify(keybinds, null, 2) + "\n";
  }
}

