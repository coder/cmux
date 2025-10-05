import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo } from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("IpcMain create workspace integration tests", () => {
  test.concurrent("should fail to create workspace with invalid name", async () => {
    const env = await createTestEnvironment();
    const tempGitRepo = await createTempGitRepo();

    try {
      // Test various invalid names
      const invalidNames = [
        { name: "", expectedError: "empty" },
        { name: "My-Branch", expectedError: "lowercase" },
        { name: "branch name", expectedError: "lowercase" },
        { name: "branch@123", expectedError: "lowercase" },
        { name: "branch/test", expectedError: "lowercase" },
        { name: "branch\\test", expectedError: "lowercase" },
        { name: "branch.test", expectedError: "lowercase" },
        { name: "a".repeat(65), expectedError: "64 characters" },
      ];

      for (const { name, expectedError } of invalidNames) {
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          name
        );
        expect(createResult.success).toBe(false);
        expect(createResult.error.toLowerCase()).toContain(expectedError.toLowerCase());
      }
    } finally {
      await cleanupTestEnvironment(env);
      await cleanupTempGitRepo(tempGitRepo);
    }
  }, 15000);

  test.concurrent("should successfully create workspace with valid name", async () => {
    const env = await createTestEnvironment();
    const tempGitRepo = await createTempGitRepo();

    try {
      // Test various valid names (avoid "main" as it's already checked out in the repo)
      const validNames = [
        "feature-branch",
        "feature_branch",
        "branch123",
        "test-branch_123",
        "x", // Single character
        "b".repeat(64), // Max length
      ];

      for (const name of validNames) {
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          name
        );
        if (!createResult.success) {
          console.error(`Failed to create workspace "${name}":`, createResult.error);
        }
        expect(createResult.success).toBe(true);
        expect(createResult.metadata.id).toBeDefined();
        expect(createResult.metadata.workspacePath).toBeDefined();
        expect(createResult.metadata.projectName).toBeDefined();

        // Clean up the workspace
        if (createResult.metadata.id) {
          await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, createResult.metadata.id);
        }
      }
    } finally {
      await cleanupTestEnvironment(env);
      await cleanupTempGitRepo(tempGitRepo);
    }
  }, 30000);
});
