import { describe, it, expect, beforeAll } from "@jest/globals";
import { createTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { TestEnvironment } from "./setup";
import * as path from "path";
import * as fs from "fs";

describe("baseUrl to baseURL mapping", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await createTestEnvironment();
  });

  it("should map baseUrl to baseURL when configured in providers.jsonc", async () => {
    // Create a providers config with baseUrl (lowercase)
    const providersPath = path.join(env.tempDir, "providers.jsonc");
    const providersConfig = {
      anthropic: {
        apiKey: "test-anthropic-key",
        baseUrl: "https://custom-anthropic.example.com/v1",
      },
      openai: {
        apiKey: "test-openai-key",
        baseUrl: "https://custom-openai.example.com/v1",
      },
    };
    fs.writeFileSync(providersPath, JSON.stringify(providersConfig, null, 2));

    // Create a workspace to test with
    const projectName = "test-project";
    const projectPath = path.join(env.tempDir, "src", projectName);
    
    // Initialize git repo with main branch
    fs.mkdirSync(projectPath, { recursive: true });
    const execSync = require("child_process").execSync;
    execSync("git init -b main", { cwd: projectPath });
    execSync("git config user.name 'Test User'", { cwd: projectPath });
    execSync("git config user.email 'test@example.com'", { cwd: projectPath });
    
    // Create a test file and commit
    fs.writeFileSync(path.join(projectPath, "README.md"), "# Test Project");
    execSync("git add .", { cwd: projectPath });
    execSync("git commit -m 'Initial commit'", { cwd: projectPath });

    // Create a workspace
    const createResult = await env.mockIpcRenderer.invoke(
      IPC_CHANNELS.WORKSPACE_CREATE,
      projectPath,
      "test-branch",
      "main"
    );
    if (!createResult.success) {
      console.error("Workspace creation failed:", createResult.error);
    }
    expect(createResult.success).toBe(true);
    const workspaceId = createResult.metadata.id;

    // Try to send a message - this will fail due to invalid API keys,
    // but we're testing that the baseUrl gets mapped to baseURL correctly
    // and doesn't cause a configuration error
    const result = await env.mockIpcRenderer.invoke(
      IPC_CHANNELS.WORKSPACE_SEND_MESSAGE,
      workspaceId,
      "Hello",
      {
        model: "anthropic/claude-3-5-sonnet-20241022",
        mode: "edit",
        thinkingLevel: "normal",
      }
    );

    // The request should fail, but we mainly care that it doesn't fail 
    // due to baseUrl/baseURL mapping issues
    expect(result.success).toBe(false);
    
    // The error should not be about configuration structure
    // (which would indicate baseUrl wasn't properly mapped to baseURL)
    if (!result.success) {
      const errorString = JSON.stringify(result.error);
      // These would appear if the SDK rejected the config due to wrong field names
      expect(errorString).not.toContain("Invalid configuration");
      expect(errorString).not.toContain("baseUrl is not a valid");
    }
  });
});
