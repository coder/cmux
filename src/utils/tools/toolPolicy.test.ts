import { applyToolPolicy, type ToolPolicy } from "./toolPolicy";
import { tool } from "ai";
import { z } from "zod";

// Create mock tools for testing
const mockTools = {
  bash: tool({
    description: "Execute bash commands",
    inputSchema: z.object({ command: z.string() }),
    execute: () => Promise.resolve({ output: "test" }),
  }),
  file_read: tool({
    description: "Read files",
    inputSchema: z.object({ path: z.string() }),
    execute: () => Promise.resolve({ content: "test" }),
  }),
  file_edit_replace: tool({
    description: "Replace content in files",
    inputSchema: z.object({ path: z.string(), mode: z.string() }),
    execute: () => Promise.resolve({ success: true }),
  }),
  file_edit_insert: tool({
    description: "Insert content in files",
    inputSchema: z.object({ path: z.string() }),
    execute: () => Promise.resolve({ success: true }),
  }),
  web_search: tool({
    description: "Search the web",
    inputSchema: z.object({ query: z.string() }),
    execute: () => Promise.resolve({ results: [] }),
  }),
};

describe("applyToolPolicy", () => {
  describe("default behavior", () => {
    test("allows all tools when no policy provided", () => {
      const result = applyToolPolicy(mockTools);
      expect(Object.keys(result)).toEqual(Object.keys(mockTools));
    });

    test("allows all tools when policy is empty array", () => {
      const result = applyToolPolicy(mockTools, []);
      expect(Object.keys(result)).toEqual(Object.keys(mockTools));
    });
  });

  describe("disabling specific tools", () => {
    test("disables bash tool", () => {
      const policy: ToolPolicy = [{ regex_match: "bash", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeUndefined();
      expect(result.file_read).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_insert).toBeDefined();
      expect(result.web_search).toBeDefined();
    });

    test("disables multiple specific tools", () => {
      const policy: ToolPolicy = [
        { regex_match: "bash", action: "disable" },
        { regex_match: "web_search", action: "disable" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeUndefined();
      expect(result.web_search).toBeUndefined();
      expect(result.file_read).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_insert).toBeDefined();
    });
  });

  describe("regex patterns", () => {
    test("disables all file_edit_.* tools", () => {
      const policy: ToolPolicy = [{ regex_match: "file_edit_.*", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.bash).toBeDefined();
      expect(result.file_read).toBeDefined();
      expect(result.web_search).toBeDefined();
    });

    test("disables all tools with .* pattern", () => {
      const policy: ToolPolicy = [{ regex_match: ".*", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(Object.keys(result)).toHaveLength(0);
    });

    test("disables all tools starting with 'file'", () => {
      const policy: ToolPolicy = [{ regex_match: "file.*", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.file_read).toBeUndefined();
      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.bash).toBeDefined();
      expect(result.web_search).toBeDefined();
    });
  });

  describe("enable after disable (order matters)", () => {
    test("disables all tools then enables bash", () => {
      const policy: ToolPolicy = [
        { regex_match: ".*", action: "disable" },
        { regex_match: "bash", action: "enable" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeDefined();
      expect(result.file_read).toBeUndefined();
      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.web_search).toBeUndefined();
    });

    test("disables file_edit_.* then enables file_edit_replace", () => {
      const policy: ToolPolicy = [
        { regex_match: "file_edit_.*", action: "disable" },
        { regex_match: "file_edit_replace", action: "enable" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.bash).toBeDefined();
      expect(result.file_read).toBeDefined();
      expect(result.web_search).toBeDefined();
    });

    test("enables bash then disables it (last wins)", () => {
      const policy: ToolPolicy = [
        { regex_match: "bash", action: "enable" },
        { regex_match: "bash", action: "disable" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeUndefined();
    });
  });

  describe("complex scenarios", () => {
    test("Plan Mode: disables file edits, keeps file_read and bash", () => {
      const policy: ToolPolicy = [{ regex_match: "file_edit_.*", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.file_read).toBeDefined();
      expect(result.bash).toBeDefined();
      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
    });

    test("Execute Mode: allows all tools (no policy)", () => {
      const result = applyToolPolicy(mockTools);

      expect(result.bash).toBeDefined();
      expect(result.file_read).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_replace).toBeDefined();
      expect(result.file_edit_insert).toBeDefined();
    });

    test("disables all except bash and file_read", () => {
      const policy: ToolPolicy = [
        { regex_match: ".*", action: "disable" },
        { regex_match: "bash", action: "enable" },
        { regex_match: "file_read", action: "enable" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeDefined();
      expect(result.file_read).toBeDefined();
      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.web_search).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    test("handles empty tools object", () => {
      const policy: ToolPolicy = [{ regex_match: ".*", action: "disable" }];
      const result = applyToolPolicy({}, policy);

      expect(Object.keys(result)).toHaveLength(0);
    });

    test("handles pattern that matches nothing", () => {
      const policy: ToolPolicy = [{ regex_match: "nonexistent_tool", action: "disable" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(Object.keys(result)).toEqual(Object.keys(mockTools));
    });
  });

  describe("require action", () => {
    test("requires a single tool and disables all others", () => {
      const policy: ToolPolicy = [{ regex_match: "bash", action: "require" }];
      const result = applyToolPolicy(mockTools, policy);

      expect(result.bash).toBeDefined();
      expect(Object.keys(result)).toHaveLength(1);
      expect(result.file_read).toBeUndefined();
      expect(result.file_edit_replace).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.file_edit_insert).toBeUndefined();
      expect(result.web_search).toBeUndefined();
    });

    test("requires tool with regex pattern", () => {
      const policy: ToolPolicy = [{ regex_match: "file_.*", action: "require" }];

      // This should throw because multiple tools match (file_read, file_edit_replace, file_edit_insert)
      expect(() => applyToolPolicy(mockTools, policy)).toThrow(/Multiple tools marked as required/);
    });

    test("requires specific tool with other filters ignored", () => {
      const policy: ToolPolicy = [
        { regex_match: ".*", action: "disable" },
        { regex_match: "bash", action: "enable" },
        { regex_match: "file_read", action: "require" },
      ];
      const result = applyToolPolicy(mockTools, policy);

      // When a tool is required, all other filters are ignored
      expect(result.file_read).toBeDefined();
      expect(Object.keys(result)).toHaveLength(1);
      expect(result.bash).toBeUndefined();
    });

    test("throws error when multiple tools are required", () => {
      const policy: ToolPolicy = [
        { regex_match: "bash", action: "require" },
        { regex_match: "file_read", action: "require" },
      ];

      expect(() => applyToolPolicy(mockTools, policy)).toThrow(
        /Multiple tools marked as required \(bash, file_read\)/
      );
    });

    test("requires nonexistent tool returns empty result", () => {
      const policy: ToolPolicy = [{ regex_match: "nonexistent", action: "require" }];
      const result = applyToolPolicy(mockTools, policy);

      // No tool matches, so no tools are required, fall back to standard logic
      // Since no other filters exist, all tools should be enabled
      expect(Object.keys(result)).toEqual(Object.keys(mockTools));
    });
  });
});
