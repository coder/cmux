import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Config } from "@/config";
import { InitStateManager } from "./initStateManager";
import type { WorkspaceInitEvent } from "@/types/ipc";

describe("InitStateManager", () => {
  let tempDir: string;
  let config: Config;
  let manager: InitStateManager;

  beforeEach(async () => {
    // Create temp directory as cmux root
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "init-state-test-"));

    // Create sessions directory
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    // Config constructor takes rootDir directly
    config = new Config(tempDir);
    manager = new InitStateManager(config);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("lifecycle", () => {
    it("should track init hook lifecycle (start → output → end)", async () => {
      const workspaceId = "test-workspace";
      const events: Array<WorkspaceInitEvent & { workspaceId: string }> = [];

      // Subscribe to events
      manager.on("init-start", (event) => events.push(event));
      manager.on("init-output", (event) => events.push(event));
      manager.on("init-end", (event) => events.push(event));

      // Start init
      manager.startInit(workspaceId, "/path/to/hook");
      expect(manager.getInitState(workspaceId)).toBeTruthy();
      expect(manager.getInitState(workspaceId)?.status).toBe("running");

      // Append output
      manager.appendOutput(workspaceId, "Installing deps...", false);
      manager.appendOutput(workspaceId, "Done!", false);
      expect(manager.getInitState(workspaceId)?.lines).toEqual(["Installing deps...", "Done!"]);

      // End init (await to ensure event fires)
      await manager.endInit(workspaceId, 0);
      expect(manager.getInitState(workspaceId)?.status).toBe("success");
      expect(manager.getInitState(workspaceId)?.exitCode).toBe(0);

      // Verify events
      expect(events).toHaveLength(4); // start + 2 outputs + end
      expect(events[0].type).toBe("init-start");
      expect(events[1].type).toBe("init-output");
      expect(events[2].type).toBe("init-output");
      expect(events[3].type).toBe("init-end");
    });

    it("should prefix stderr lines with ERROR:", () => {
      const workspaceId = "test-workspace";
      manager.startInit(workspaceId, "/path/to/hook");

      manager.appendOutput(workspaceId, "stdout line", false);
      manager.appendOutput(workspaceId, "stderr line", true);

      const state = manager.getInitState(workspaceId);
      expect(state?.lines).toEqual(["stdout line", "ERROR: stderr line"]);
    });

    it("should set status to error on non-zero exit code", async () => {
      const workspaceId = "test-workspace";
      manager.startInit(workspaceId, "/path/to/hook");
      await manager.endInit(workspaceId, 1);

      const state = manager.getInitState(workspaceId);
      expect(state?.status).toBe("error");
      expect(state?.exitCode).toBe(1);
    });
  });

  describe("persistence", () => {
    it("should persist state to disk on endInit", async () => {
      const workspaceId = "test-workspace";
      manager.startInit(workspaceId, "/path/to/hook");
      manager.appendOutput(workspaceId, "Line 1", false);
      manager.appendOutput(workspaceId, "Line 2", true);
      await manager.endInit(workspaceId, 0);

      // Read from disk
      const diskState = await manager.readInitStatus(workspaceId);
      expect(diskState).toBeTruthy();
      expect(diskState?.status).toBe("success");
      expect(diskState?.exitCode).toBe(0);
      expect(diskState?.lines).toEqual(["Line 1", "ERROR: Line 2"]);
    });

    it("should replay from in-memory state when available", async () => {
      const workspaceId = "test-workspace";
      const events: Array<WorkspaceInitEvent & { workspaceId: string }> = [];

      manager.on("init-start", (event) => events.push(event));
      manager.on("init-output", (event) => events.push(event));
      manager.on("init-end", (event) => events.push(event));

      // Create state
      manager.startInit(workspaceId, "/path/to/hook");
      manager.appendOutput(workspaceId, "Line 1", false);
      await manager.endInit(workspaceId, 0);

      events.length = 0; // Clear events

      // Replay from in-memory
      await manager.replayInit(workspaceId);

      expect(events).toHaveLength(3); // start + output + end
      expect(events[0].type).toBe("init-start");
      expect(events[1].type).toBe("init-output");
      expect(events[2].type).toBe("init-end");
    });

    it("should replay from disk when not in memory", async () => {
      const workspaceId = "test-workspace";
      const events: Array<WorkspaceInitEvent & { workspaceId: string }> = [];

      // Create and persist state
      manager.startInit(workspaceId, "/path/to/hook");
      manager.appendOutput(workspaceId, "Line 1", false);
      manager.appendOutput(workspaceId, "Error line", true);
      await manager.endInit(workspaceId, 1);

      // Clear in-memory state (simulate process restart)
      manager.clearInMemoryState(workspaceId);
      expect(manager.getInitState(workspaceId)).toBeUndefined();

      // Subscribe to events
      manager.on("init-start", (event) => events.push(event));
      manager.on("init-output", (event) => events.push(event));
      manager.on("init-end", (event) => events.push(event));

      // Replay from disk
      await manager.replayInit(workspaceId);

      expect(events).toHaveLength(4); // start + 2 outputs + end
      expect(events[0].type).toBe("init-start");
      expect(events[1].type).toBe("init-output");
      expect((events[1] as { line: string }).line).toBe("Line 1");
      expect(events[2].type).toBe("init-output");
      expect((events[2] as { line: string }).line).toBe("Error line");
      expect((events[2] as { isError?: boolean }).isError).toBe(true);
      expect(events[3].type).toBe("init-end");
      expect((events[3] as { exitCode: number }).exitCode).toBe(1);
    });

    it("should not replay if no state exists", async () => {
      const workspaceId = "nonexistent-workspace";
      const events: Array<WorkspaceInitEvent & { workspaceId: string }> = [];

      manager.on("init-start", (event) => events.push(event));
      manager.on("init-output", (event) => events.push(event));
      manager.on("init-end", (event) => events.push(event));

      await manager.replayInit(workspaceId);

      expect(events).toHaveLength(0);
    });
  });

  describe("cleanup", () => {
    it("should delete persisted state from disk", async () => {
      const workspaceId = "test-workspace";
      manager.startInit(workspaceId, "/path/to/hook");
      await manager.endInit(workspaceId, 0);

      // Verify state exists
      const stateBeforeDelete = await manager.readInitStatus(workspaceId);
      expect(stateBeforeDelete).toBeTruthy();

      // Delete
      await manager.deleteInitStatus(workspaceId);

      // Verify deleted
      const stateAfterDelete = await manager.readInitStatus(workspaceId);
      expect(stateAfterDelete).toBeNull();
    });

    it("should clear in-memory state", () => {
      const workspaceId = "test-workspace";
      manager.startInit(workspaceId, "/path/to/hook");

      expect(manager.getInitState(workspaceId)).toBeTruthy();

      manager.clearInMemoryState(workspaceId);

      expect(manager.getInitState(workspaceId)).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should handle appendOutput with no active state", () => {
      const workspaceId = "nonexistent-workspace";
      // Should not throw
      manager.appendOutput(workspaceId, "Line", false);
    });

    it("should handle endInit with no active state", async () => {
      const workspaceId = "nonexistent-workspace";
      // Should not throw
      await manager.endInit(workspaceId, 0);
    });

    it("should handle deleteInitStatus for nonexistent file", async () => {
      const workspaceId = "nonexistent-workspace";
      // Should not throw
      await manager.deleteInitStatus(workspaceId);
    });
  });
});
