import { describe, expect, test } from "@jest/globals";
import {
  generateImageId,
  fileToImageAttachment,
  extractImagesFromClipboard,
  extractImagesFromDrop,
  processImageFiles,
} from "./imageHandling";

// Mock FileReader for Node.js environment
class MockFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(blob: Blob) {
    // Simulate async read with setTimeout
    setTimeout(() => {
      // Create a fake base64 data URL based on the blob type
      const fakeDataUrl = `data:${blob.type};base64,ZmFrZWRhdGE=`;
      if (this.onload) {
        this.onload({ target: { result: fakeDataUrl } });
      }
    }, 0);
  }
}

global.FileReader = MockFileReader as unknown as typeof FileReader;

describe("imageHandling", () => {
  describe("generateImageId", () => {
    test("generates unique IDs", () => {
      const id1 = generateImageId();
      const id2 = generateImageId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe("fileToImageAttachment", () => {
    test("converts a File to ImageAttachment", async () => {
      // Create a mock image file
      const blob = new Blob(["fake image data"], { type: "image/png" });
      const file = new File([blob], "test.png", { type: "image/png" });

      const attachment = await fileToImageAttachment(file);

      expect(attachment).toMatchObject({
        id: expect.stringMatching(/^\d+-[a-z0-9]+$/),
        url: expect.stringContaining("data:image/png;base64,"),
        mediaType: "image/png",
      });
    });

    test("handles JPEG images", async () => {
      const blob = new Blob(["fake jpeg data"], { type: "image/jpeg" });
      const file = new File([blob], "test.jpg", { type: "image/jpeg" });

      const attachment = await fileToImageAttachment(file);

      expect(attachment.mediaType).toBe("image/jpeg");
      expect(attachment.url).toContain("data:image/jpeg;base64,");
    });
  });

  describe("extractImagesFromClipboard", () => {
    test("extracts image files from clipboard items", () => {
      // Mock clipboard items
      const mockFile = new File(["fake image"], "test.png", { type: "image/png" });

      const mockItems = [
        {
          type: "image/png",
          getAsFile: () => mockFile,
        },
        {
          type: "text/plain",
          getAsFile: () => null,
        },
      ] as unknown as DataTransferItemList;

      const files = extractImagesFromClipboard(mockItems);

      expect(files).toHaveLength(1);
      expect(files[0]).toBe(mockFile);
    });

    test("ignores non-image items", () => {
      const mockItems: DataTransferItemList = [
        {
          type: "text/plain",
          getAsFile: () => new File(["text"], "test.txt", { type: "text/plain" }),
        },
        {
          type: "text/html",
          getAsFile: () => new File(["<p>html</p>"], "test.html", { type: "text/html" }),
        },
      ] as unknown as DataTransferItemList;

      const files = extractImagesFromClipboard(mockItems);

      expect(files).toHaveLength(0);
    });

    test("handles multiple images", () => {
      const mockFile1 = new File(["fake image 1"], "test1.png", { type: "image/png" });
      const mockFile2 = new File(["fake image 2"], "test2.jpg", { type: "image/jpeg" });

      const mockItems = [
        {
          type: "image/png",
          getAsFile: () => mockFile1,
        },
        {
          type: "image/jpeg",
          getAsFile: () => mockFile2,
        },
      ] as unknown as DataTransferItemList;

      const files = extractImagesFromClipboard(mockItems);

      expect(files).toHaveLength(2);
      expect(files).toContain(mockFile1);
      expect(files).toContain(mockFile2);
    });
  });

  describe("extractImagesFromDrop", () => {
    test("extracts image files from DataTransfer", () => {
      const mockFile1 = new File(["image 1"], "test1.png", { type: "image/png" });
      const mockFile2 = new File(["text"], "test.txt", { type: "text/plain" });
      const mockFile3 = new File(["image 2"], "test2.jpg", { type: "image/jpeg" });

      const mockDataTransfer = {
        files: [mockFile1, mockFile2, mockFile3],
      };

      const files = extractImagesFromDrop(mockDataTransfer as DataTransfer);

      expect(files).toHaveLength(2);
      expect(files).toContain(mockFile1);
      expect(files).toContain(mockFile3);
      expect(files).not.toContain(mockFile2);
    });

    test("returns empty array when no images", () => {
      const mockFile = new File(["text"], "test.txt", { type: "text/plain" });

      const mockDataTransfer = {
        files: [mockFile],
      };

      const files = extractImagesFromDrop(mockDataTransfer as DataTransfer);

      expect(files).toHaveLength(0);
    });
  });

  describe("processImageFiles", () => {
    test("converts multiple files to attachments", async () => {
      const file1 = new File(["image 1"], "test1.png", { type: "image/png" });
      const file2 = new File(["image 2"], "test2.jpg", { type: "image/jpeg" });

      const attachments = await processImageFiles([file1, file2]);

      expect(attachments).toHaveLength(2);
      expect(attachments[0].mediaType).toBe("image/png");
      expect(attachments[1].mediaType).toBe("image/jpeg");
      expect(attachments[0].url).toContain("data:image/png;base64,");
      expect(attachments[1].url).toContain("data:image/jpeg;base64,");
    });

    test("handles empty array", async () => {
      const attachments = await processImageFiles([]);

      expect(attachments).toHaveLength(0);
    });
  });
});
