import { TerminalServer } from "./terminalServer";
import { PTYService } from "./ptyService";
import WebSocket from "ws";
import type { AddressInfo } from "net";

// Most WebSocket tests require a real server and are tested in integration tests
// These unit tests verify the TerminalServer initialization and basic API
describe("TerminalServer", () => {
  let terminalServer: TerminalServer;
  let ptyService: PTYService;

  beforeEach(() => {
    ptyService = new PTYService();
    terminalServer = new TerminalServer(ptyService);
  });

  afterEach(async () => {
    await terminalServer.stop();
  });

  describe("initialization", () => {
    it("should create a TerminalServer instance", () => {
      expect(terminalServer).toBeInstanceOf(TerminalServer);
    });

    it("should throw if getPort called before start", () => {
      expect(() => terminalServer.getPort()).toThrow("TerminalServer not started");
    });
  });

  describe("sendOutput", () => {
    it("should not throw when sending to non-existent session", () => {
      // Should handle gracefully (no clients)
      expect(() => {
        terminalServer.sendOutput("fake-session", "test");
      }).not.toThrow();
    });
  });

  describe("sendExit", () => {
    it("should not throw when sending exit to non-existent session", () => {
      // Should handle gracefully (no clients)
      expect(() => {
        terminalServer.sendExit("fake-session", 0);
      }).not.toThrow();
    });
  });
});
