import { getSlashCommandDefinitions, type SlashCommandDefinition } from "./commandParser";
import { getModelAliasEntries } from "../constants/models";
import { getModelsForProvider } from "./modelCatalog";

export interface SlashSuggestion {
  id: string;
  display: string;
  description: string;
  replacement: string;
}

export interface SlashSuggestionContext {
  providerNames?: string[];
}

interface SuggestionDefinition {
  key: string;
  description: string;
  appendSpace?: boolean;
}

const COMMAND_DEFINITIONS = getSlashCommandDefinitions();

const COMMAND_DEFINITION_MAP = new Map<string, SlashCommandDefinition>(
  COMMAND_DEFINITIONS.map((definition) => [definition.key, definition])
);

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

function filterAndMapSuggestions<T extends SuggestionDefinition>(
  definitions: ReadonlyArray<T>,
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

function buildTopLevelSuggestions(partial: string): SlashSuggestion[] {
  return filterAndMapSuggestions(COMMAND_DEFINITIONS, partial, (definition) => {
    const appendSpace = definition.appendSpace ?? true;
    const replacement = `/${definition.key}${appendSpace ? " " : ""}`;
    return {
      id: `command:${definition.key}`,
      display: `/${definition.key}`,
      description: definition.description,
      replacement,
    };
  });
}

function buildSubcommandSuggestions(
  commandDefinition: SlashCommandDefinition,
  partial: string,
  prefixTokens: string[]
): SlashSuggestion[] {
  const subcommands = commandDefinition.children ?? [];

  return filterAndMapSuggestions(subcommands, partial, (definition) => {
    const appendSpace = definition.appendSpace ?? true;
    const replacementTokens = [...prefixTokens, definition.key];
    const replacementBase = `/${replacementTokens.join(" ")}`;
    return {
      id: `command:${replacementTokens.join(":")}`,
      display: definition.key,
      description: definition.description,
      replacement: `${replacementBase}${appendSpace ? " " : ""}`,
    };
  });
}

function dedupeDefinitions<T extends SuggestionDefinition>(definitions: ReadonlyArray<T>): T[] {
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

function buildProviderNameSuggestions(
  partial: string,
  providerNames: string[] | undefined
): SlashSuggestion[] {
  const dynamicDefinitions = (providerNames ?? []).map((name) => ({
    key: name,
    description: `${name} provider configuration`,
  }));

  const combined = dedupeDefinitions([...dynamicDefinitions, ...DEFAULT_PROVIDER_NAMES]);

  return filterAndMapSuggestions(combined, partial, (definition) => ({
    id: `command:providers:set:${definition.key}`,
    display: definition.key,
    description: definition.description,
    replacement: `/providers set ${definition.key} `,
  }));
}

function buildProviderKeySuggestions(
  partial: string,
  providerName: string | undefined
): SlashSuggestion[] {
  const definitions = [
    ...(providerName && DEFAULT_PROVIDER_KEYS[providerName]
      ? DEFAULT_PROVIDER_KEYS[providerName]
      : []),
    ...DEFAULT_PROVIDER_KEYS.default,
  ];

  const combined = dedupeDefinitions(definitions);

  return filterAndMapSuggestions(combined, partial, (definition) => ({
    id: `command:providers:set:${providerName}:${definition.key}`,
    display: definition.key,
    description: definition.description,
    replacement: `/providers set ${providerName ?? ""} ${definition.key} `,
  }));
}

function buildModelFirstArgSuggestions(
  partial: string,
  providerNames: string[] | undefined
): SlashSuggestion[] {
  const normalizedPartial = partial.trim().toLowerCase();

  const aliasSuggestions = getModelAliasEntries()
    .filter(({ alias }) =>
      normalizedPartial ? alias.toLowerCase().startsWith(normalizedPartial) : true
    )
    .map(({ alias, model }) => ({
      id: `command:model:alias:${alias}`,
      display: alias,
      description: `Alias for ${model}`,
      replacement: `/model ${alias}`,
    }));

  const providerDefinitions = dedupeDefinitions([
    ...(providerNames ?? []).map((name) => ({
      key: name,
      description: `${name} provider configuration`,
    })),
    ...DEFAULT_PROVIDER_NAMES,
  ]);

  const providerSuggestions = filterAndMapSuggestions(
    providerDefinitions,
    partial,
    (definition) => ({
      id: `command:model:provider:${definition.key}`,
      display: definition.key,
      description: definition.description,
      replacement: `/model ${definition.key} `,
    })
  );

  return [...aliasSuggestions, ...providerSuggestions];
}

function buildModelCommandSuggestions(
  stage: number,
  partialToken: string,
  context: SlashSuggestionContext,
  completedTokens: string[],
  tokens: string[]
): SlashSuggestion[] {
  if (stage === 1) {
    return buildModelFirstArgSuggestions(partialToken, context.providerNames);
  }

  if (stage === 2) {
    const providerName = completedTokens[1] ?? tokens[1];
    if (!providerName) {
      return [];
    }

    const models = getModelsForProvider(providerName);
    if (models.length === 0) {
      return [];
    }

    const normalizedPartial = partialToken.trim().toLowerCase();

    return models
      .filter((model) =>
        normalizedPartial ? model.toLowerCase().includes(normalizedPartial) : true
      )
      .slice(0, 25)
      .map((model) => ({
        id: `command:model:${providerName}:${model}`,
        display: model,
        description: `${providerName}:${model}`,
        replacement: `/model ${providerName} ${model}`,
      }));
  }

  return [];
}

export function getSlashCommandSuggestions(
  input: string,
  context: SlashSuggestionContext = {}
): SlashSuggestion[] {
  if (!input.startsWith("/")) {
    return [];
  }

  const remainder = input.slice(1);
  if (remainder.startsWith(" ")) {
    return [];
  }

  const parts = remainder.split(/\s+/);
  const tokens = parts.filter((part) => part.length > 0);
  const hasTrailingSpace = remainder.endsWith(" ") || remainder.length === 0;
  const completedTokens = hasTrailingSpace ? tokens : tokens.slice(0, -1);
  const partialToken = hasTrailingSpace ? "" : (tokens[tokens.length - 1] ?? "");
  const stage = completedTokens.length;

  if (stage === 0) {
    return buildTopLevelSuggestions(partialToken);
  }

  const rootKey = completedTokens[0] ?? tokens[0];
  if (!rootKey) {
    return [];
  }

  const rootDefinition = COMMAND_DEFINITION_MAP.get(rootKey);
  if (!rootDefinition) {
    return [];
  }

  const definitionPath: SlashCommandDefinition[] = [rootDefinition];
  let lastDefinition = rootDefinition;

  for (let i = 1; i < completedTokens.length; i++) {
    const token = completedTokens[i];
    const nextDefinition = (lastDefinition.children ?? []).find((child) => child.key === token);

    if (!nextDefinition) {
      break;
    }

    definitionPath.push(nextDefinition);
    lastDefinition = nextDefinition;
  }

  const matchedDefinitionCount = definitionPath.length;

  if (stage <= matchedDefinitionCount) {
    const definitionForSuggestions = definitionPath[Math.max(0, stage - 1)];

    if (definitionForSuggestions && (definitionForSuggestions.children ?? []).length > 0) {
      const prefixTokens = completedTokens.slice(0, stage);
      return buildSubcommandSuggestions(definitionForSuggestions, partialToken, prefixTokens);
    }
  }

  if (definitionPath[0]?.key === "model") {
    return buildModelCommandSuggestions(stage, partialToken, context, completedTokens, tokens);
  }

  if (definitionPath[0]?.key !== "providers") {
    return [];
  }

  const setDefinition = definitionPath[1];
  if (!setDefinition || setDefinition.key !== "set") {
    return [];
  }

  if (stage === 2) {
    return buildProviderNameSuggestions(partialToken, context.providerNames);
  }

  const providerName = completedTokens[2] ?? tokens[2];
  if (!providerName) {
    return [];
  }

  if (stage === 3) {
    return buildProviderKeySuggestions(partialToken, providerName);
  }

  return [];
}
