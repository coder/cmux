import { resolveModelAlias } from "../constants/models";

/**
 * Command parser for parsing chat commands like /providers
 */

export type ParsedCommand =
  | { type: "providers-set"; provider: string; keyPath: string[]; value: string }
  | { type: "providers-help" }
  | { type: "providers-invalid-subcommand"; subcommand: string }
  | { type: "providers-missing-args"; subcommand: string; argCount: number }
  | { type: "model-set"; model: string; requested: string; source: "alias" | "explicit" | "provider-model" }
  | { type: "model-help" }
  | { type: "model-invalid-input"; input?: string }
  | { type: "clear" }
  | { type: "unknown-command"; command: string; subcommand?: string }
  | null;

export interface SlashCommandDefinition {
  key: string;
  description: string;
  appendSpace?: boolean;
  handler?: SlashCommandHandler;
  children?: ReadonlyArray<SlashCommandDefinition>;
}

interface SlashCommandHandlerArgs {
  definition: SlashCommandDefinition;
  path: ReadonlyArray<SlashCommandDefinition>;
  remainingTokens: string[];
  cleanRemainingTokens: string[];
}

type SlashCommandHandler = (input: SlashCommandHandlerArgs) => ParsedCommand;

const clearCommandDefinition: SlashCommandDefinition = {
  key: "clear",
  description: "Clear conversation history",
  appendSpace: false,
  handler: ({ cleanRemainingTokens }) => {
    if (cleanRemainingTokens.length > 0) {
      return {
        type: "unknown-command",
        command: "clear",
        subcommand: cleanRemainingTokens[0],
      };
    }

    return { type: "clear" };
  },
};

const providersSetCommandDefinition: SlashCommandDefinition = {
  key: "set",
  description: "Set a provider configuration value",
  handler: ({ cleanRemainingTokens }) => {
    if (cleanRemainingTokens.length < 3) {
      return {
        type: "providers-missing-args",
        subcommand: "set",
        argCount: cleanRemainingTokens.length,
      };
    }

    const [provider, key, ...valueParts] = cleanRemainingTokens;
    const value = valueParts.join(" ");
    const keyPath = key.split(".");

    return {
      type: "providers-set",
      provider,
      keyPath,
      value,
    };
  },
};

const providersCommandDefinition: SlashCommandDefinition = {
  key: "providers",
  description: "Configure AI provider settings",
  handler: ({ cleanRemainingTokens }) => {
    if (cleanRemainingTokens.length === 0) {
      return { type: "providers-help" };
    }

    return {
      type: "providers-invalid-subcommand",
      subcommand: cleanRemainingTokens[0] ?? "",
    };
  },
  children: [providersSetCommandDefinition],
};

const modelCommandDefinition: SlashCommandDefinition = {
  key: "model",
  description: "Select the AI model",
  handler: ({ cleanRemainingTokens }) => {
    if (cleanRemainingTokens.length === 0) {
      return { type: "model-help" };
    }

    const [firstToken, ...restTokens] = cleanRemainingTokens;

    if (restTokens.length === 0) {
      const aliasModel = resolveModelAlias(firstToken);
      if (aliasModel) {
        return {
          type: "model-set",
          model: aliasModel,
          requested: firstToken,
          source: "alias",
        };
      }

      if (firstToken.includes(":")) {
        const [provider, ...modelParts] = firstToken.split(":");
        const modelName = modelParts.join(":");
        if (provider && modelName) {
          return {
            type: "model-set",
            model: `${provider}:${modelName}`,
            requested: firstToken,
            source: "explicit",
          };
        }
      }

      return {
        type: "model-invalid-input",
        input: firstToken,
      };
    }

    const provider = firstToken;
    const modelName = restTokens.join(" ").trim();

    if (!modelName) {
      return {
        type: "model-invalid-input",
        input: provider,
      };
    }

    return {
      type: "model-set",
      model: `${provider}:${modelName}`,
      requested: `${provider} ${modelName}`,
      source: "provider-model",
    };
  },
};
const SLASH_COMMAND_DEFINITIONS: ReadonlyArray<SlashCommandDefinition> = [
  clearCommandDefinition,
  providersCommandDefinition,
  modelCommandDefinition,
];

const SLASH_COMMAND_DEFINITION_MAP = new Map(
  SLASH_COMMAND_DEFINITIONS.map((definition) => [definition.key, definition])
);

export function getSlashCommandDefinitions(): ReadonlyArray<SlashCommandDefinition> {
  return SLASH_COMMAND_DEFINITIONS;
}

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
  const parts = (trimmed.substring(1).match(/(?:[^\s"]+|"[^"]*")+/g) || []) as string[];
  if (parts.length === 0) {
    return null;
  }

  const [commandKey, ...restTokens] = parts;
  const definition = SLASH_COMMAND_DEFINITION_MAP.get(commandKey);

  if (!definition) {
    return {
      type: "unknown-command",
      command: commandKey || "",
      subcommand: restTokens[0],
    };
  }

  const path: SlashCommandDefinition[] = [definition];
  let remainingTokens = restTokens;

  while (remainingTokens.length > 0) {
    const currentDefinition = path[path.length - 1];
    const children = currentDefinition.children ?? [];
    const nextToken = remainingTokens[0];
    const nextDefinition = children.find((child) => child.key === nextToken);

    if (!nextDefinition) {
      break;
    }

    path.push(nextDefinition);
    remainingTokens = remainingTokens.slice(1);
  }

  const targetDefinition = path[path.length - 1];

  if (!targetDefinition.handler) {
    return {
      type: "unknown-command",
      command: commandKey || "",
      subcommand: remainingTokens[0],
    };
  }

  const cleanRemainingTokens = remainingTokens.map((token) =>
    token.replace(/^"(.*)"$/, "$1")
  );

  return targetDefinition.handler({
    definition: targetDefinition,
    path,
    remainingTokens,
    cleanRemainingTokens,
  });
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

  let current = obj;
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
