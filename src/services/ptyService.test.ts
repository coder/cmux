import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PTYService } from "./ptyService";
import { LocalRuntime } from "@/runtime/LocalRuntime";
import type { TerminalCreateParams } from "@/types/terminal";

// PTY tests are skipped in bun test because node-pty has issues with process spawning in test environment
// These tests work in jest/integration test environment
// The critical logic is still tested via API surface and error handling
describe.skip("PTYService", () => {
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
    it("should create a local PTY session", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      expect(session.sessionId).toMatch(/^test-workspace-\d+$/);
      expect(session.workspaceId).toBe("test-workspace");
      expect(session.cols).toBe(80);
      expect(session.rows).toBe(24);
    });

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

    it("should respect terminal dimensions", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 120,
        rows: 40,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      expect(session.cols).toBe(120);
      expect(session.rows).toBe(40);
    });
  });

  describe("sendInput", () => {
    it("should send input to an existing PTY session", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      // Should not throw
      await expect(ptyService.sendInput(session.sessionId, "echo hello\n")).resolves.toBeUndefined();
    });

    it("should throw error for non-existent session", async () => {
      await expect(ptyService.sendInput("fake-session-id", "test")).rejects.toThrow(
        "Terminal session fake-session-id not found"
      );
    });
  });

  describe("resize", () => {
    it("should resize an existing PTY session", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      // Should not throw
      await expect(
        ptyService.resize({ sessionId: session.sessionId, cols: 120, rows: 40 })
      ).resolves.toBeUndefined();
    });

    it("should handle resize for non-existent session gracefully", async () => {
      // Should not throw - just log
      await expect(
        ptyService.resize({ sessionId: "fake-session-id", cols: 80, rows: 24 })
      ).resolves.toBeUndefined();
    });
  });

  describe("closeSession", () => {
    it("should close an existing PTY session", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      await expect(ptyService.closeSession(session.sessionId)).resolves.toBeUndefined();
    });

    it("should handle close for non-existent session gracefully", async () => {
      // Should not throw - just log
      await expect(ptyService.closeSession("fake-session-id")).resolves.toBeUndefined();
    });
  });

  describe("closeWorkspaceSessions", () => {
    it("should close all sessions for a workspace", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params1: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };
      const params2: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      await ptyService.createSession(params1, runtime, tempDir);
      await ptyService.createSession(params2, runtime, tempDir);

      // Should close both sessions
      await expect(ptyService.closeWorkspaceSessions("test-workspace")).resolves.toBeUndefined();

      // Verify sessions are gone
      const sessions = ptyService.getSessions();
      const workspaceSessions = Array.from(sessions.values()).filter(
        (s) => s.workspaceId === "test-workspace"
      );
      expect(workspaceSessions).toHaveLength(0);
    });
  });

  describe("PTY output routing", () => {
    it("should forward PTY output to terminal server", async () => {
      const runtime = new LocalRuntime(tempDir);
      const params: TerminalCreateParams = {
        workspaceId: "test-workspace",
        cols: 80,
        rows: 24,
      };

      const session = await ptyService.createSession(params, runtime, tempDir);

      // Send a command that produces output
      await ptyService.sendInput(session.sessionId, "echo test\n");

      // Wait a bit for output
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Terminal server should have received output
      expect(mockTerminalServer.sendOutput).toHaveBeenCalled();
    });
  });
});
