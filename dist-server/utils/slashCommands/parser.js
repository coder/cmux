"use strict";
/**
 * Command parser for parsing chat commands
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLASH_COMMAND_DEFINITIONS = void 0;
exports.parseCommand = parseCommand;
exports.setNestedProperty = setNestedProperty;
exports.getSlashCommandDefinitions = getSlashCommandDefinitions;
const registry_1 = require("./registry");
var registry_2 = require("./registry");
Object.defineProperty(exports, "SLASH_COMMAND_DEFINITIONS", { enumerable: true, get: function () { return registry_2.SLASH_COMMAND_DEFINITIONS; } });
/**
 * Parse a raw command string into a structured command
 * @param input The raw command string (e.g., "/providers set anthropic apiKey sk-xxx")
 * @returns Parsed command or null if not a command
 */
function parseCommand(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
        return null;
    }
    // Remove leading slash and split by spaces (respecting quotes)
    const parts = (trimmed.substring(1).match(/(?:[^\s"]+|"[^"]*")+/g) ?? []);
    if (parts.length === 0) {
        return null;
    }
    const [commandKey, ...restTokens] = parts;
    const definition = registry_1.SLASH_COMMAND_DEFINITION_MAP.get(commandKey);
    if (!definition) {
        return {
            type: "unknown-command",
            command: commandKey ?? "",
            subcommand: restTokens[0],
        };
    }
    const path = [definition];
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
            command: commandKey ?? "",
            subcommand: remainingTokens[0],
        };
    }
    const cleanRemainingTokens = remainingTokens.map((token) => token.replace(/^"(.*)"$/, "$1"));
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
function setNestedProperty(obj, keyPath, value) {
    if (keyPath.length === 0) {
        return;
    }
    let current = obj;
    for (let i = 0; i < keyPath.length - 1; i++) {
        const key = keyPath[i];
        if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    const lastKey = keyPath[keyPath.length - 1];
    current[lastKey] = value;
}
/**
 * Get slash command definitions for use in suggestions
 */
function getSlashCommandDefinitions() {
    return Array.from(registry_1.SLASH_COMMAND_DEFINITION_MAP.values());
}
//# sourceMappingURL=parser.js.map