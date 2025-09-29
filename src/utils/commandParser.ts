/**
 * Command parser for parsing chat commands like /providers
 */

export type ParsedCommand =
  | { type: "providers-set"; provider: string; keyPath: string[]; value: string }
  | { type: "providers-help" }
  | { type: "providers-invalid-subcommand"; subcommand: string }
  | { type: "providers-missing-args"; subcommand: string; argCount: number }
  | { type: "clear" }
  | { type: "unknown-command"; command: string; subcommand?: string }
  | null;

/**
 * Parse a raw command string into a structured command
 * @param input The raw command string (e.g., "/providers set anthropic apiKey sk-xxx")
 * @returns Parsed command or null if not a command
 */
export function parseCommand(input: string): ParsedCommand {
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
  const cleanArgs = args.map((arg) => arg.replace(/^"(.*)"$/, "$1")); // Remove surrounding quotes

  // Handle /clear command
  if (command === "clear" && !subcommand) {
    return { type: "clear" };
  }

  // Handle /providers commands
  if (command === "providers") {
    // No subcommand - show help
    if (!subcommand) {
      return { type: "providers-help" };
    }

    // Invalid subcommand
    if (subcommand !== "set") {
      return {
        type: "providers-invalid-subcommand",
        subcommand,
      };
    }

    // /providers set - check arguments
    if (cleanArgs.length < 3) {
      return {
        type: "providers-missing-args",
        subcommand: "set",
        argCount: cleanArgs.length,
      };
    }

    // Valid /providers set command
    const [provider, key, ...valueParts] = cleanArgs;
    const value = valueParts.join(" "); // Join remaining parts as value (handles spaces)
    const keyPath = key.split("."); // Split key by dots for nested path

    return {
      type: "providers-set",
      provider,
      keyPath,
      value,
    };
  }

  // Unknown command
  return {
    type: "unknown-command",
    command: command || "",
    subcommand,
  };
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
