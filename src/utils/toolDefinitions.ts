/**
 * Tool definitions module - Frontend-safe
 *
 * This module contains tool schema definitions that can be used
 * by both frontend and backend code. It must not import any Node.js
 * modules or backend-specific code to remain browser-compatible.
 */

/**
 * Get tool definition schemas for token counting
 * These represent the approximate structure sent to the API
 *
 * @returns Record of tool name to approximate schema
 */
export function getToolSchemas(): Record<string, any> {
  return {
    bash: {
      name: "bash",
      description: "Execute a bash command with a configurable timeout",
      inputSchema: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "The bash script/command to execute",
          },
          timeout_secs: {
            type: "number",
            description: "Timeout in seconds for command execution",
          },
        },
        required: ["script", "timeout_secs"],
      },
    },
    read_file: {
      name: "read_file",
      description: "Read the contents of a file from the file system",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The path to the file to read (absolute or relative)",
          },
          encoding: {
            type: "string",
            enum: ["utf-8", "ascii", "base64", "hex", "binary"],
            default: "utf-8",
            description: "The encoding to use when reading the file",
          },
        },
        required: ["filePath"],
      },
    },
    web_search: {
      name: "web_search",
      description: "Search the web and return relevant results",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return",
            default: 5,
          },
        },
        required: ["query"],
      },
    },
    google_search: {
      name: "google_search",
      description: "Search using Google and return relevant results",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return",
            default: 5,
          },
        },
        required: ["query"],
      },
    },
  };
}

/**
 * Get which tools are available for a given model
 * @param modelString The model string (e.g., "anthropic:claude-opus-4-1")
 * @returns Array of tool names available for the model
 */
export function getAvailableTools(modelString: string): string[] {
  const [provider] = modelString.split(":");

  // Base tools available for all models
  const baseTools = ["bash", "read_file"];

  // Add provider-specific tools
  switch (provider) {
    case "anthropic":
      return [...baseTools, "web_search"];
    case "openai":
      // Only some OpenAI models support web search
      if (modelString.includes("gpt-4") || modelString.includes("gpt-5")) {
        return [...baseTools, "web_search"];
      }
      return baseTools;
    case "google":
      return [...baseTools, "google_search"];
    default:
      return baseTools;
  }
}
