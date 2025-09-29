/**
 * Command processor for handling chat commands like /providers
 */

export interface ParsedCommand {
  command: string;
  subcommand?: string;
  args: string[];
}

export interface ProvidersSetCommand {
  type: "providers-set";
  provider: string;
  keyPath: string[];
  value: string;
}

export type ProcessedCommand =
  | ProvidersSetCommand
  | { type: "invalid-syntax"; command: string; message: string }
  | { type: "unknown"; raw: string };

/**
 * Parse a raw command string into structured components
 * @param input The raw command string (e.g., "/providers set anthropic apiKey sk-xxx")
 * @returns Parsed command structure or null if not a command
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Remove leading slash and split by spaces (respecting quotes)
  const parts = trimmed.substring(1).match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  if (parts.length === 0) {
    return null;
  }

  const [command, subcommand, ...args] = parts;
  return {
    command: command || "",
    subcommand,
    args: args.map((arg) => arg.replace(/^"(.*)"$/, "$1")), // Remove surrounding quotes
  };
}

/**
 * Process a parsed command into a strongly typed command object
 * @param parsed The parsed command
 * @returns Processed command with type-safe structure
 */
export function processCommand(parsed: ParsedCommand): ProcessedCommand {
  if (parsed.command === "providers") {
    if (parsed.subcommand === "set") {
      // Check for missing arguments
      if (parsed.args.length === 0) {
        return {
          type: "invalid-syntax",
          command: "/providers set",
          message:
            "Missing provider, key, and value. Usage: /providers set <provider> <key> <value>",
        };
      } else if (parsed.args.length === 1) {
        return {
          type: "invalid-syntax",
          command: "/providers set",
          message: "Missing key and value. Usage: /providers set <provider> <key> <value>",
        };
      } else if (parsed.args.length === 2) {
        return {
          type: "invalid-syntax",
          command: "/providers set",
          message: "Missing value. Usage: /providers set <provider> <key> <value>",
        };
      }

      // Valid syntax
      const [provider, key, ...valueParts] = parsed.args;
      const value = valueParts.join(" "); // Join remaining parts as value (handles spaces)

      // Split key by dots for nested path (e.g., "baseUrl.scheme" -> ["baseUrl", "scheme"])
      const keyPath = key.split(".");

      return {
        type: "providers-set",
        provider,
        keyPath,
        value,
      };
    }
  }

  // Unknown or invalid command
  return {
    type: "unknown",
    raw: "/" + parsed.command + (parsed.subcommand ? " " + parsed.subcommand : ""),
  };
}

/**
 * Convenience function to parse and process in one step
 * @param input Raw command string
 * @returns Processed command or null if not a command
 */
export function parseAndProcessCommand(input: string): ProcessedCommand | null {
  const parsed = parseCommand(input);
  if (!parsed) {
    return null;
  }
  return processCommand(parsed);
}

/**
 * Set a nested property value using a key path
 * @param obj The object to modify
 * @param keyPath Array of keys representing the path (e.g., ["baseUrl", "scheme"])
 * @param value The value to set
 */
export function setNestedProperty(
  obj: Record<string, unknown>,
  keyPath: string[],
  value: string
): void {
  if (keyPath.length === 0) {
    return;
  }

  let current = obj as Record<string, unknown>;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keyPath[keyPath.length - 1];
  current[lastKey] = value;
}
