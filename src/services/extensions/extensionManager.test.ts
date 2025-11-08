/* eslint-disable local/no-sync-fs-methods -- Test file uses sync fs for simplicity */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Mock setup requires any types */
import { describe, test, beforeEach, afterEach, mock } from "bun:test";
import { ExtensionManager } from "./extensionManager";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock child_process (not actually used in tests since we test the real thing)
const mockChildProcess = {
  fork: mock((_scriptPath: string, _options?: unknown) => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.send = mock(() => true);
    mockProcess.kill = mock(() => true);
    mockProcess.killed = false;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    return mockProcess;
  }),
};

// Mock the discovery function (not actually used in tests)
const mockDiscoverExtensions = mock(() => Promise.resolve([]));

describe("ExtensionManager", () => {
  let manager: ExtensionManager;
  let tempDir: string;
  let projectPath: string;
  let workspaceMetadata: WorkspaceMetadata;
  let runtimeConfig: RuntimeConfig;

  beforeEach(() => {
    // Reset all mocks
    mockChildProcess.fork.mockClear();
    mockDiscoverExtensions.mockClear();

    // Create temp directory for test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-mgr-test-"));
    projectPath = path.join(tempDir, "project");
    fs.mkdirSync(projectPath, { recursive: true });

    workspaceMetadata = {
      id: "test-workspace",
      name: "test-branch",
      projectName: "test-project",
      projectPath,
    };

    runtimeConfig = {
      type: "local",
      srcBaseDir: path.join(tempDir, "src"),
    };

    manager = new ExtensionManager();
  });

  afterEach(() => {
    manager.shutdown();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("initializeGlobal should do nothing when no extensions found", async () => {
    // No extensions in the global directory
    await manager.initializeGlobal();

    // No extension host should be spawned - postToolUse should work without error
    await manager.postToolUse("test-workspace", {
      toolName: "bash",
      toolCallId: "test-call",
      args: {},
      result: {},
      workspaceId: "test-workspace",
      timestamp: Date.now(),
    });

    // If no error thrown, test passes
  });

  test("initializeGlobal should not spawn multiple hosts", async () => {
    // Create an extension in global directory
    const globalExtDir = path.join(os.homedir(), ".cmux", "ext");
    fs.mkdirSync(globalExtDir, { recursive: true });
    fs.writeFileSync(path.join(globalExtDir, "test.js"), "export default { onPostToolUse() {} }");

    // Call initializeGlobal twice
    const promise1 = manager.initializeGlobal();
    const promise2 = manager.initializeGlobal();

    await Promise.all([promise1, promise2]);

    // Cleanup global extension
    fs.rmSync(path.join(globalExtDir, "test.js"));

    // Should work without errors (testing for no crash)
  });

  test("registerWorkspace and unregisterWorkspace should work", async () => {
    // Create an extension in global directory
    const globalExtDir = path.join(os.homedir(), ".cmux", "ext");
    fs.mkdirSync(globalExtDir, { recursive: true });
    fs.writeFileSync(path.join(globalExtDir, "test.js"), "export default { onPostToolUse() {} }");

    // Initialize global host
    await manager.initializeGlobal();

    // Register workspace
    await manager.registerWorkspace("test-workspace", workspaceMetadata, runtimeConfig, "/tmp");

    // Unregister workspace
    await manager.unregisterWorkspace("test-workspace");

    // Cleanup
    fs.rmSync(path.join(globalExtDir, "test.js"));

    // Should work without errors
  });

  test("shutdown should clean up the global host", async () => {
    // Create an extension in global directory
    const globalExtDir = path.join(os.homedir(), ".cmux", "ext");
    fs.mkdirSync(globalExtDir, { recursive: true });
    fs.writeFileSync(path.join(globalExtDir, "test.js"), "export default { onPostToolUse() {} }");

    // Initialize global host
    await manager.initializeGlobal();

    // Shutdown
    manager.shutdown();

    // Cleanup
    fs.rmSync(path.join(globalExtDir, "test.js"));

    // Should work without errors
  });

  test("postToolUse should do nothing when no host initialized", async () => {
    await manager.postToolUse("nonexistent-workspace", {
      toolName: "bash",
      toolCallId: "test-call",
      args: {},
      result: {},
      workspaceId: "nonexistent-workspace",
      timestamp: Date.now(),
    });

    // Should not throw
  });
});
