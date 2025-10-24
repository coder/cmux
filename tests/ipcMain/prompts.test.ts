import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo } from "./helpers";
import { detectDefaultTrunkBranch } from "../../src/git";
import * as fs from "fs/promises";
import * as path from "path";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("IpcMain prompts integration tests", () => {
  test.concurrent(
    "should list prompts from both system and repo directories",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-prompts",
          trunkBranch
        );
        expect(createResult.success).toBe(true);

        const workspaceId = createResult.metadata.id;

        // Create system-level prompts
        const systemPromptsDir = path.join(env.config.rootDir, "prompts");
        await fs.mkdir(systemPromptsDir, { recursive: true });
        await fs.writeFile(
          path.join(systemPromptsDir, "system-prompt.md"),
          "This is a system-level prompt"
        );
        await fs.writeFile(
          path.join(systemPromptsDir, "shared-prompt.md"),
          "System version of shared prompt"
        );

        // Create repo-level prompts
        const repoPromptsDir = path.join(createResult.metadata.namedWorkspacePath, ".cmux");
        await fs.mkdir(repoPromptsDir, { recursive: true });
        await fs.writeFile(
          path.join(repoPromptsDir, "repo-prompt.md"),
          "This is a repo-level prompt"
        );
        await fs.writeFile(
          path.join(repoPromptsDir, "shared-prompt.md"),
          "Repo version of shared prompt (should override system)"
        );

        // List prompts
        const prompts = await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROMPTS_LIST, workspaceId);

        expect(prompts).toHaveLength(3);

        // Verify all prompts are present
        const promptNames = prompts.map((p: { name: string }) => p.name).sort();
        expect(promptNames).toEqual(["repo-prompt", "shared-prompt", "system-prompt"]);

        // Verify locations
        const repoPrompt = prompts.find((p: { name: string }) => p.name === "repo-prompt");
        expect(repoPrompt.location).toBe("repo");

        const systemPrompt = prompts.find((p: { name: string }) => p.name === "system-prompt");
        expect(systemPrompt.location).toBe("system");

        // Verify repo prompts override system prompts
        const sharedPrompt = prompts.find((p: { name: string }) => p.name === "shared-prompt");
        expect(sharedPrompt.location).toBe("repo");
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should read prompt content from correct location",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-read-prompts",
          trunkBranch
        );
        expect(createResult.success).toBe(true);

        const workspaceId = createResult.metadata.id;

        // Create system-level prompt
        const systemPromptsDir = path.join(env.config.rootDir, "prompts");
        await fs.mkdir(systemPromptsDir, { recursive: true });
        const systemContent = "System prompt content";
        await fs.writeFile(path.join(systemPromptsDir, "test-prompt.md"), systemContent);

        // Create repo-level prompt (should override)
        const repoPromptsDir = path.join(createResult.metadata.namedWorkspacePath, ".cmux");
        await fs.mkdir(repoPromptsDir, { recursive: true });
        const repoContent = "Repo prompt content (overrides system)";
        await fs.writeFile(path.join(repoPromptsDir, "test-prompt.md"), repoContent);

        // Read prompt - should get repo version
        const content = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.PROMPTS_READ,
          workspaceId,
          "test-prompt"
        );

        expect(content).toBe(repoContent);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should return null for non-existent prompt",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-missing-prompts",
          trunkBranch
        );
        expect(createResult.success).toBe(true);

        const workspaceId = createResult.metadata.id;

        // Try to read non-existent prompt
        const content = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.PROMPTS_READ,
          workspaceId,
          "non-existent-prompt"
        );

        expect(content).toBeNull();
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should return empty list for workspace without prompts",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-no-prompts",
          trunkBranch
        );
        expect(createResult.success).toBe(true);

        const workspaceId = createResult.metadata.id;

        // List prompts (should be empty)
        const prompts = await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROMPTS_LIST, workspaceId);

        expect(prompts).toEqual([]);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );
});

