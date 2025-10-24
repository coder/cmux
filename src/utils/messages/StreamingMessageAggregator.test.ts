import { describe, test, expect } from "bun:test";
import { StreamingMessageAggregator } from "./StreamingMessageAggregator";

describe("StreamingMessageAggregator", () => {
  describe("init state reference stability", () => {
    test("should return new array reference when state changes", () => {
      const aggregator = new StreamingMessageAggregator();

      // Start init hook
      aggregator.handleMessage({
        type: "init-start",
        hookPath: "/test/init",
        timestamp: Date.now(),
      });

      const messages1 = aggregator.getDisplayedMessages();

      // Add output to change state
      aggregator.handleMessage({
        type: "init-output",
        line: "Line 1",
        isError: false,
        timestamp: Date.now(),
      });

      const messages2 = aggregator.getDisplayedMessages();

      // Array references should be different when state changes
      expect(messages1).not.toBe(messages2);
    });

    test("should return new lines array reference when init state changes", () => {
      const aggregator = new StreamingMessageAggregator();

      // Start init hook
      aggregator.handleMessage({
        type: "init-start",
        hookPath: "/test/init",
        timestamp: Date.now(),
      });

      const messages1 = aggregator.getDisplayedMessages();
      const initMsg1 = messages1.find((m) => m.type === "workspace-init");
      expect(initMsg1).toBeDefined();

      // Add output
      aggregator.handleMessage({
        type: "init-output",
        line: "Line 1",
        isError: false,
        timestamp: Date.now(),
      });

      const messages2 = aggregator.getDisplayedMessages();
      const initMsg2 = messages2.find((m) => m.type === "workspace-init");
      expect(initMsg2).toBeDefined();

      // Lines array should be a NEW reference (critical for React.memo)
      if (initMsg1?.type === "workspace-init" && initMsg2?.type === "workspace-init") {
        expect(initMsg1.lines).not.toBe(initMsg2.lines);
        expect(initMsg2.lines).toHaveLength(1);
        expect(initMsg2.lines[0]).toBe("Line 1");
      }
    });

    test("should create new init message object on each state change", () => {
      const aggregator = new StreamingMessageAggregator();

      // Start init hook
      aggregator.handleMessage({
        type: "init-start",
        hookPath: "/test/init",
        timestamp: Date.now(),
      });

      const messages1 = aggregator.getDisplayedMessages();
      const initMsg1 = messages1.find((m) => m.type === "workspace-init");

      // Add multiple outputs
      aggregator.handleMessage({
        type: "init-output",
        line: "Line 1",
        isError: false,
        timestamp: Date.now(),
      });

      const messages2 = aggregator.getDisplayedMessages();
      const initMsg2 = messages2.find((m) => m.type === "workspace-init");

      aggregator.handleMessage({
        type: "init-output",
        line: "Line 2",
        isError: false,
        timestamp: Date.now(),
      });

      const messages3 = aggregator.getDisplayedMessages();
      const initMsg3 = messages3.find((m) => m.type === "workspace-init");

      // Each message object should be a new reference
      expect(initMsg1).not.toBe(initMsg2);
      expect(initMsg2).not.toBe(initMsg3);

      // Lines arrays should be different references
      if (
        initMsg1?.type === "workspace-init" &&
        initMsg2?.type === "workspace-init" &&
        initMsg3?.type === "workspace-init"
      ) {
        expect(initMsg1.lines).not.toBe(initMsg2.lines);
        expect(initMsg2.lines).not.toBe(initMsg3.lines);

        // Verify content progression
        expect(initMsg1.lines).toHaveLength(0);
        expect(initMsg2.lines).toHaveLength(1);
        expect(initMsg3.lines).toHaveLength(2);
      }
    });

    test("should return same cached reference when state has not changed", () => {
      const aggregator = new StreamingMessageAggregator();

      // Start init hook
      aggregator.handleMessage({
        type: "init-start",
        hookPath: "/test/init",
        timestamp: Date.now(),
      });

      const messages1 = aggregator.getDisplayedMessages();
      const messages2 = aggregator.getDisplayedMessages();

      // When no state changes, cache should return same reference
      expect(messages1).toBe(messages2);
    });
  });
});
