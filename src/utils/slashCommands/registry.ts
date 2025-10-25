/**
 * Command registry - All slash commands are declared here
 */

import type {
  SlashCommandDefinition,
  ParsedCommand,
  SlashSuggestion,
  SuggestionDefinition,
} from "./types";
import minimist from "minimist";

/**
 * Parse multiline command input into first-line tokens and remaining message
 * Used by commands that support messages on subsequent lines (/compact, /fork, /new)
 */
function parseMultilineCommand(rawInput: string): {
  firstLine: string;
  tokens: string[];
  message: string | undefined;
  hasMultiline: boolean;
} {
  const hasMultiline = rawInput.includes("\n");
  const lines = rawInput.split("\n");
  const firstLine = lines[0];
  const remainingLines = lines.slice(1).join("\n").trim();

  // Tokenize first line only (preserving quotes)
  const tokens = (firstLine.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((token) =>
    token.replace(/^"(.*)"$/, "$1")
  );

  return {
    firstLine,
    tokens,
    message: remainingLines.length > 0 ? remainingLines : undefined,
    hasMultiline,
  };
}

// Model abbreviations for common models
// Order matters: first model becomes the default for new chats
export const MODEL_ABBREVIATIONS: Record<string, string> = {
  sonnet: "anthropic:claude-sonnet-4-5",
  haiku: "anthropic:claude-haiku-4-5",
  opus: "anthropic:claude-opus-4-1",
  "gpt-5": "openai:gpt-5",
  "gpt-5-pro": "openai:gpt-5-pro",
  codex: "openai:gpt-5-codex",
};

// Provider configuration data
const DEFAULT_PROVIDER_NAMES: SuggestionDefinition[] = [
  {
    key: "anthropic",
    description: "Anthropic (Claude) provider",
  },
  {
    key: "openai",
    description: "OpenAI provider",
  },
  {
    key: "google",
    description: "Google Gemini provider",
  },
];

const DEFAULT_PROVIDER_KEYS: Record<string, SuggestionDefinition[]> = {
  anthropic: [
    {
      key: "apiKey",
      description: "API key used when calling Anthropic",
    },
    {
      key: "baseUrl",
      description: "Override Anthropic base URL",
    },
    {
      key: "baseUrl.scheme",
      description: "Protocol to use for the base URL",
    },
  ],
  openai: [
    {
      key: "apiKey",
      description: "API key used when calling OpenAI",
    },
    {
      key: "baseUrl",
      description: "Override OpenAI base URL",
    },
  ],
  google: [
    {
      key: "apiKey",
      description: "API key used when calling Google Gemini",
    },
  ],
  default: [
    {
      key: "apiKey",
      description: "API key required by the provider",
    },
    {
      key: "baseUrl",
      description: "Override provider base URL",
    },
    {
      key: "baseUrl.scheme",
      description: "Protocol to use for the base URL",
    },
  ],
};

// Suggestion helper functions
function filterAndMapSuggestions<T extends SuggestionDefinition>(
  definitions: readonly T[],
  partial: string,
  build: (definition: T) => SlashSuggestion
): SlashSuggestion[] {
  const normalizedPartial = partial.trim().toLowerCase();

  return definitions
    .filter((definition) =>
      normalizedPartial ? definition.key.toLowerCase().startsWith(normalizedPartial) : true
    )
    .map((definition) => build(definition));
}

function dedupeDefinitions<T extends SuggestionDefinition>(definitions: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const definition of definitions) {
    const key = definition.key.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(definition);
  }

  return result;
}

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

const truncateCommandDefinition: SlashCommandDefinition = {
  key: "truncate",
  description: "Truncate conversation history by percentage (0-100)",
  handler: ({ cleanRemainingTokens }): ParsedCommand => {
    if (cleanRemainingTokens.length === 0) {
      return {
        type: "unknown-command",
        command: "truncate",
        subcommand: undefined,
      };
    }

    if (cleanRemainingTokens.length > 1) {
      return {
        type: "unknown-command",
        command: "truncate",
        subcommand: cleanRemainingTokens[1],
      };
    }

    // Parse percentage (0-100)
    const pctStr = cleanRemainingTokens[0];
    const pct = parseFloat(pctStr);

    if (isNaN(pct) || pct < 0 || pct > 100) {
      return {
        type: "unknown-command",
        command: "truncate",
        subcommand: pctStr,
      };
    }

    // Convert to 0.0-1.0
    return { type: "truncate", percentage: pct / 100 };
  },
};

const compactCommandDefinition: SlashCommandDefinition = {
  key: "compact",
  description:
    "Compact conversation history using AI summarization. Use -t <tokens> to set max output tokens, -m <model> to set compaction model. Add continue message on lines after the command.",
  handler: ({ rawInput }): ParsedCommand => {
    const {
      tokens: firstLineTokens,
      message: remainingLines,
      hasMultiline,
    } = parseMultilineCommand(rawInput);

    // Parse flags from first line using minimist
    const parsed = minimist(firstLineTokens, {
      string: ["t", "c", "m"],
      unknown: (arg: string) => {
        // Unknown flags starting with - are errors
        if (arg.startsWith("-")) {
          return false;
        }
        return true;
      },
    });

    // Check for unknown flags (only from first line)
    const unknownFlags = firstLineTokens.filter(
      (token) => token.startsWith("-") && token !== "-t" && token !== "-c" && token !== "-m"
    );
    if (unknownFlags.length > 0) {
      return {
        type: "unknown-command",
        command: "compact",
        subcommand: `Unknown flag: ${unknownFlags[0]}`,
      };
    }

    // Validate -t value if present
    let maxOutputTokens: number | undefined;
    if (parsed.t !== undefined) {
      const tokens = parseInt(parsed.t as string, 10);
      if (isNaN(tokens) || tokens <= 0) {
        return {
          type: "unknown-command",
          command: "compact",
          subcommand: `-t requires a positive number, got ${String(parsed.t)}`,
        };
      }
      maxOutputTokens = tokens;
    }

    // Handle -m (model) flag: resolve abbreviation if present, otherwise use as-is
    let model: string | undefined;
    if (parsed.m !== undefined && typeof parsed.m === "string" && parsed.m.trim().length > 0) {
      const modelInput = parsed.m.trim();
      // Check if it's an abbreviation
      model = MODEL_ABBREVIATIONS[modelInput] ?? modelInput;
    }

    // Reject extra positional arguments UNLESS they're from multiline content
    // (multiline content gets parsed as positional args by minimist since newlines become spaces)
    if (parsed._.length > 0 && !hasMultiline) {
      return {
        type: "unknown-command",
        command: "compact",
        subcommand: `Unexpected argument: ${parsed._[0]}`,
      };
    }

    // Determine continue message:
    // 1. If -c flag present (backwards compat), use it
    // 2. Otherwise, use multiline content (new behavior)
    let continueMessage: string | undefined;

    if (parsed.c !== undefined && typeof parsed.c === "string" && parsed.c.trim().length > 0) {
      // -c flag takes precedence (backwards compatibility)
      continueMessage = parsed.c.trim();
    } else if (remainingLines) {
      // Use multiline content
      continueMessage = remainingLines;
    }

    return { type: "compact", maxOutputTokens, continueMessage, model };
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
  suggestions: ({ stage, partialToken, completedTokens, context }) => {
    // Stage 2: /providers set [provider]
    if (stage === 2) {
      const dynamicDefinitions = (context.providerNames ?? []).map((name) => ({
        key: name,
        description: `${name} provider configuration`,
      }));

      const combined = dedupeDefinitions([...dynamicDefinitions, ...DEFAULT_PROVIDER_NAMES]);

      return filterAndMapSuggestions(combined, partialToken, (definition) => ({
        id: `command:providers:set:${definition.key}`,
        display: definition.key,
        description: definition.description,
        replacement: `/providers set ${definition.key} `,
      }));
    }

    // Stage 3: /providers set <provider> [key]
    if (stage === 3) {
      const providerName = completedTokens[2];
      const definitions = [
        ...(providerName && DEFAULT_PROVIDER_KEYS[providerName]
          ? DEFAULT_PROVIDER_KEYS[providerName]
          : []),
        ...DEFAULT_PROVIDER_KEYS.default,
      ];

      const combined = dedupeDefinitions(definitions);

      return filterAndMapSuggestions(combined, partialToken, (definition) => ({
        id: `command:providers:set:${providerName}:${definition.key}`,
        display: definition.key,
        description: definition.description,
        replacement: `/providers set ${providerName ?? ""} ${definition.key} `,
      }));
    }

    return null;
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
  description: "Select AI model",
  handler: ({ cleanRemainingTokens }): ParsedCommand => {
    if (cleanRemainingTokens.length === 0) {
      return { type: "model-help" };
    }

    if (cleanRemainingTokens.length === 1) {
      const token = cleanRemainingTokens[0];

      // Check if it's an abbreviation
      if (MODEL_ABBREVIATIONS[token]) {
        return {
          type: "model-set",
          modelString: MODEL_ABBREVIATIONS[token],
        };
      }

      // Otherwise treat as full model string (e.g., "anthropic:opus" or "anthropic:claude-opus-4-1")
      return {
        type: "model-set",
        modelString: token,
      };
    }

    // Too many arguments
    return {
      type: "unknown-command",
      command: "model",
      subcommand: cleanRemainingTokens[1],
    };
  },
  suggestions: ({ stage, partialToken }) => {
    // Stage 1: /model [abbreviation]
    if (stage === 1) {
      const abbreviationSuggestions = Object.entries(MODEL_ABBREVIATIONS).map(
        ([abbrev, fullModel]) => ({
          key: abbrev,
          description: fullModel,
        })
      );

      return filterAndMapSuggestions(abbreviationSuggestions, partialToken, (definition) => ({
        id: `command:model:${definition.key}`,
        display: definition.key,
        description: definition.description,
        replacement: `/model ${definition.key}`,
      }));
    }

    return null;
  },
};

const telemetryCommandDefinition: SlashCommandDefinition = {
  key: "telemetry",
  description: "Enable or disable telemetry",
  handler: ({ cleanRemainingTokens }): ParsedCommand => {
    if (cleanRemainingTokens.length === 0) {
      return { type: "telemetry-help" };
    }

    if (cleanRemainingTokens.length === 1) {
      const arg = cleanRemainingTokens[0].toLowerCase();
      if (arg === "on" || arg === "off") {
        return { type: "telemetry-set", enabled: arg === "on" };
      }
    }

    return {
      type: "unknown-command",
      command: "telemetry",
      subcommand: cleanRemainingTokens[0],
    };
  },
  suggestions: ({ stage, partialToken }) => {
    if (stage === 1) {
      const options = [
        { key: "on", description: "Enable telemetry" },
        { key: "off", description: "Disable telemetry" },
      ];

      return filterAndMapSuggestions(options, partialToken, (definition) => ({
        id: `command:telemetry:${definition.key}`,
        display: definition.key,
        description: definition.description,
        replacement: `/telemetry ${definition.key}`,
      }));
    }

    return null;
  },
};

const forkCommandDefinition: SlashCommandDefinition = {
  key: "fork",
  description:
    "Fork workspace with new name and optional start message. Add start message on lines after the command.",
  handler: ({ rawInput }): ParsedCommand => {
    const { tokens, message } = parseMultilineCommand(rawInput);

    if (tokens.length === 0) {
      return {
        type: "fork-help",
      };
    }

    const newName = tokens[0];

    // Start message can be from remaining tokens on same line or multiline content
    let startMessage: string | undefined;
    if (message) {
      // Multiline content takes precedence
      startMessage = message;
    } else if (tokens.length > 1) {
      // Join remaining tokens on first line
      startMessage = tokens.slice(1).join(" ").trim();
    }

    return {
      type: "fork",
      newName,
      startMessage: startMessage && startMessage.length > 0 ? startMessage : undefined,
    };
  },
};

const newCommandDefinition: SlashCommandDefinition = {
  key: "new",
  description:
    "Create new workspace with optional trunk branch and runtime. Use -t <branch> to specify trunk, -r <runtime> for remote execution (e.g., 'ssh hostname' or 'ssh user@host'). Add start message on lines after the command.",
  handler: ({ rawInput }): ParsedCommand => {
    const {
      tokens: firstLineTokens,
      message: remainingLines,
      hasMultiline,
    } = parseMultilineCommand(rawInput);

    // Parse flags from first line using minimist
    const parsed = minimist(firstLineTokens, {
      string: ["t", "r"],
      unknown: (arg: string) => {
        // Unknown flags starting with - are errors
        if (arg.startsWith("-")) {
          return false;
        }
        return true;
      },
    });

    // Check for unknown flags - return undefined workspaceName to open modal
    const unknownFlags = firstLineTokens.filter(
      (token) => token.startsWith("-") && token !== "-t" && token !== "-r"
    );
    if (unknownFlags.length > 0) {
      return {
        type: "new",
        workspaceName: undefined,
        trunkBranch: undefined,
        runtime: undefined,
        startMessage: undefined,
      };
    }

    // No workspace name provided - return undefined to open modal
    if (parsed._.length === 0) {
      return {
        type: "new",
        workspaceName: undefined,
        trunkBranch: undefined,
        runtime: undefined,
        startMessage: undefined,
      };
    }

    // Get workspace name (first positional argument)
    const workspaceName = String(parsed._[0]);

    // Reject extra positional arguments - return undefined to open modal
    if (parsed._.length > 1 && !hasMultiline) {
      return {
        type: "new",
        workspaceName: undefined,
        trunkBranch: undefined,
        runtime: undefined,
        startMessage: undefined,
      };
    }

    // Get trunk branch from -t flag
    let trunkBranch: string | undefined;
    if (parsed.t !== undefined && typeof parsed.t === "string" && parsed.t.trim().length > 0) {
      trunkBranch = parsed.t.trim();
    }

    // Get runtime from -r flag
    let runtime: string | undefined;
    if (parsed.r !== undefined && typeof parsed.r === "string" && parsed.r.trim().length > 0) {
      runtime = parsed.r.trim();
    }

    return {
      type: "new",
      workspaceName,
      trunkBranch,
      runtime,
      startMessage: remainingLines,
    };
  },
};

export const SLASH_COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = [
  clearCommandDefinition,
  truncateCommandDefinition,
  compactCommandDefinition,
  modelCommandDefinition,
  providersCommandDefinition,
  telemetryCommandDefinition,
  forkCommandDefinition,
  newCommandDefinition,
];

export const SLASH_COMMAND_DEFINITION_MAP = new Map(
  SLASH_COMMAND_DEFINITIONS.map((definition) => [definition.key, definition])
);
