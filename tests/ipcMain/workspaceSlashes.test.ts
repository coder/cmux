/**
 * Integration tests for workspace creation with slashes in branch names
 *
 * Verifies:
 * - Branch names with slashes are properly sanitized to directory names
 * - Conflict detection works between slash and dash versions
 * - Git operations use the original branch name (with slashes)
 * - Filesystem operations use the sanitized directory name (slashes → dashes)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import type { TestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo, generateBranchName } from "./helpers";
import { detectDefaultTrunkBranch } from "../../src/git";

const TEST_TIMEOUT_MS = 60000;
const INIT_HOOK_WAIT_MS = 1500; // Wait for async init hook completion

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("Workspace Creation with Slashes in Branch Names", () => {
  let env: TestEnvironment;
  let projectPath: string;
  let trunkBranch: string;

  beforeAll(async () => {
    env = await createTestEnvironment();
    projectPath = await createTempGitRepo();

    // Detect trunk branch
    const detectedTrunk = await detectDefaultTrunkBranch(projectPath);
    trunkBranch = detectedTrunk || "main";
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await cleanupTempGitRepo(projectPath);
    await cleanupTestEnvironment(env);
  }, TEST_TIMEOUT_MS);

  test(
    "creates workspace with single slash in branch name",
    async () => {
      const branchName = `feature/${generateBranchName()}`;
      const result = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        branchName,
        trunkBranch
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.name).toBe(branchName);

      // Verify directory uses sanitized name (slash → dash)
      const expectedDirName = branchName.replace(/\//g, "-");
      const workspacePath = result.metadata.namedWorkspacePath;
      expect(workspacePath).toContain(expectedDirName);

      // Verify directory exists
      await expect(fs.access(workspacePath)).resolves.not.toThrow();

      // Wait for init hook to complete
      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );

  test(
    "creates workspace with multiple slashes in branch name",
    async () => {
      const branchName = `docs/api/${generateBranchName()}`;
      const result = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        branchName,
        trunkBranch
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.name).toBe(branchName);

      // Verify directory uses sanitized name (all slashes → dashes)
      const expectedDirName = branchName.replace(/\//g, "-");
      const workspacePath = result.metadata.namedWorkspacePath;
      expect(workspacePath).toContain(expectedDirName);

      await expect(fs.access(workspacePath)).resolves.not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );

  test(
    "detects conflict between slash and dash versions",
    async () => {
      // Create workspace with dash in name
      const baseName = generateBranchName();
      const dashName = `feature-${baseName}`;
      const slashName = `feature/${baseName}`;

      // Create first workspace with dash
      const result1 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        dashName,
        trunkBranch
      );
      expect(result1.success).toBe(true);

      // Try to create second workspace with slash (should conflict)
      const result2 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        slashName,
        trunkBranch
      );

      expect(result2.success).toBe(false);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain("conflicts");
      expect(result2.error).toContain(dashName);

      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );

  test(
    "detects conflict in opposite direction (dash conflicts with slash)",
    async () => {
      // Create workspace with slash in name
      const baseName = generateBranchName();
      const slashName = `bugfix/${baseName}`;
      const dashName = `bugfix-${baseName}`;

      // Create first workspace with slash
      const result1 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        slashName,
        trunkBranch
      );
      expect(result1.success).toBe(true);

      // Try to create second workspace with dash (should conflict)
      const result2 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        dashName,
        trunkBranch
      );

      expect(result2.success).toBe(false);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain("conflicts");
      expect(result2.error).toContain(slashName);

      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );

  test(
    "allows non-conflicting slash and dash combinations",
    async () => {
      const baseName1 = generateBranchName();
      const baseName2 = generateBranchName();
      const name1 = `feature/${baseName1}`;
      const name2 = `feature-${baseName2}`; // Different base, won't conflict

      const result1 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        name1,
        trunkBranch
      );
      expect(result1.success).toBe(true);

      const result2 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        name2,
        trunkBranch
      );
      expect(result2.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );

  test(
    "renames workspace from dash to slash with conflict detection",
    async () => {
      // Create two workspaces
      const baseName1 = generateBranchName();
      const baseName2 = generateBranchName();
      const originalName = `docs-${baseName1}`;
      const existingName = `docs/${baseName2}`;
      const conflictingName = `docs/${baseName1}`; // Would conflict after rename

      // Create first workspace
      const result1 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        originalName,
        trunkBranch
      );
      expect(result1.success).toBe(true);
      const workspaceId = result1.metadata.id;

      // Create second workspace with slash
      const result2 = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_CREATE,
        projectPath,
        existingName,
        trunkBranch
      );
      expect(result2.success).toBe(true);

      // Try to rename first workspace to a name that conflicts with second
      // This shouldn't conflict since they sanitize to different directories
      const renameResult = await env.mockIpcRenderer.invoke(
        IPC_CHANNELS.WORKSPACE_RENAME,
        workspaceId,
        conflictingName
      );

      // This should succeed because baseName1 != baseName2
      // (docs-baseName1 → docs/baseName1, which sanitizes to docs-baseName1, no conflict)
      if (!renameResult.success) {
        console.log("Rename failed with error:", renameResult.error);
      }
      expect(renameResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, INIT_HOOK_WAIT_MS));
    },
    TEST_TIMEOUT_MS
  );
});
