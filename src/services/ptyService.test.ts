import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PTYService } from "./ptyService";
import { LocalRuntime } from "@/runtime/LocalRuntime";
import type { TerminalCreateParams } from "@/types/terminal";

// Most PTY tests require a real PTY and are tested in integration tests
// These unit tests verify the PTYService API surface and error handling
describe("PTYService", () => {
  let tempDir: string;
  let ptyService: PTYService;
  let mockTerminalServer: any;
  let originalPath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-pty-test-"));
    ptyService = new PTYService();
    
    // Mock terminal server
    mockTerminalServer = {
      sendOutput: jest.fn(),
      sendExit: jest.fn(),
    };
    ptyService.setTerminalServer(mockTerminalServer);

    // Save original PATH and set a working one for tests
    originalPath = process.env.PATH;
    process.env.PATH = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // Restore original PATH
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    }
  });

  describe("createSession", () => {
    it("should throw error if workspace path does not exist", async () => {
      const runtime = new LocalRuntime(tempDir);
      const nonExistentPath = path.join(tempDir, "does-not-exist");
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      await expect(
        ptyService.createSession(params, runtime, nonExistentPath)
      ).rejects.toThrow("Workspace path does not exist");
    });
  });

  describe("sendInput", () => {
    it("should throw error for non-existent session", async () => {
      await expect(ptyService.sendInput("fake-session-id", "test")).rejects.toThrow(
        "Terminal session fake-session-id not found"
      );
    });
  });

  describe("resize", () => {
    it("should handle resize for non-existent session gracefully", async () => {
      // Should not throw - just log
      await expect(
        ptyService.resize({ sessionId: "fake-session-id", cols: 80, rows: 24 })
      ).resolves.toBeUndefined();
    });
  });

  describe("closeSession", () => {
    it("should handle close for non-existent session gracefully", async () => {
      // Should not throw - just log
      await expect(ptyService.closeSession("fake-session-id")).resolves.toBeUndefined();
    });
  });

  describe("closeWorkspaceSessions", () => {
    it("should handle close for workspace with no sessions", async () => {
      // Should not throw
      await expect(ptyService.closeWorkspaceSessions("nonexistent-workspace")).resolves.toBeUndefined();
    });
  });

  describe("getSessions", () => {
    it("should return empty map initially", () => {
      const sessions = ptyService.getSessions();
      expect(sessions.size).toBe(0);
    });
  });

  describe("setTerminalServer", () => {
    it("should accept a terminal server instance", () => {
      // Should not throw
      expect(() => ptyService.setTerminalServer(mockTerminalServer)).not.toThrow();
    });
  });
});
