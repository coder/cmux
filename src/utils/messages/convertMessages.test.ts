import { describe, it, expect } from "bun:test";
import { convertToModelMessages } from "ai";
import { createFileReadTool } from "@/services/tools/file_read";
import type { UIMessage } from "ai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("convertToModelMessages with tools", () => {
  it("should use toModelOutput for image file_read results", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-test-"));

    try {
      // Create a minimal PNG
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const imgPath = path.join(tmpDir, "test.png");
      fs.writeFileSync(imgPath, png);

      // Create tool and execute
      const tool = createFileReadTool({ cwd: tmpDir, tempDir: tmpDir });
      const result = await tool.execute!(
        { filePath: imgPath },
        { toolCallId: "test", messages: [] }
      );

      // Create a message with tool result
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          parts: [{ type: "text", text: "Read image" }],
        },
        {
          id: "2",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call_1",
              toolName: "file_read",
              state: "output-available",
              input: { filePath: imgPath },
              output: result,
            },
          ],
        },
      ];

      // Convert without tools - should get JSON
      const withoutTools = convertToModelMessages(messages);
      const toolMessage = withoutTools.find((m) => m.role === "tool");
      expect(toolMessage).toBeDefined();
      if (toolMessage && toolMessage.role === "tool") {
        const content = toolMessage.content[0];
        expect(content.type).toBe("tool-result");
        if (content.type === "tool-result") {
          // Without tools, output should be JSON
          expect(content.output.type).toBe("json");
        }
      }

      // Convert with tools - should use toModelOutput and get media content
      const withTools = convertToModelMessages(messages, {
        tools: { file_read: tool },
      });
      const toolMessageWithTools = withTools.find((m) => m.role === "tool");
      expect(toolMessageWithTools).toBeDefined();
      if (toolMessageWithTools && toolMessageWithTools.role === "tool") {
        const content = toolMessageWithTools.content[0];
        expect(content.type).toBe("tool-result");
        if (content.type === "tool-result") {
          // With tools, toModelOutput should convert images to media content
          expect(content.output.type).toBe("content");
          if (content.output.type === "content") {
            expect(content.output.value).toHaveLength(1);
            expect(content.output.value[0].type).toBe("media");
            if (content.output.value[0].type === "media") {
              expect(content.output.value[0].mediaType).toBe("image/png");
            }
          }
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
