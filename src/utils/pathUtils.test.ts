import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { expandTilde, validateProjectPath } from "./pathUtils";

describe("pathUtils", () => {
  describe("expandTilde", () => {
    it("should expand ~ to home directory", () => {
      const result = expandTilde("~/Documents");
      const expected = path.join(os.homedir(), "Documents");
      expect(result).toBe(expected);
    });

    it("should expand ~/ to home directory with trailing path", () => {
      const result = expandTilde("~/Projects/my-app");
      const expected = path.join(os.homedir(), "Projects", "my-app");
      expect(result).toBe(expected);
    });

    it("should return path unchanged if it doesn't start with ~", () => {
      const testPath = "/absolute/path/to/project";
      const result = expandTilde(testPath);
      expect(result).toBe(testPath);
    });

    it("should handle ~ alone (home directory)", () => {
      const result = expandTilde("~");
      expect(result).toBe(os.homedir());
    });

    it("should handle relative paths without tilde", () => {
      const relativePath = "relative/path";
      const result = expandTilde(relativePath);
      expect(result).toBe(relativePath);
    });

    it("should handle empty string", () => {
      const result = expandTilde("");
      expect(result).toBe("");
    });
  });

  describe("validateProjectPath", () => {
    let tempDir: string;

    beforeEach(() => {
      // Create a temporary directory for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-path-test-"));
    });

    afterEach(() => {
      // Clean up temporary directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should return success for existing directory", () => {
      const result = validateProjectPath(tempDir);
      expect(result.valid).toBe(true);
      expect(result.expandedPath).toBe(tempDir);
      expect(result.error).toBeUndefined();
    });

    it("should expand tilde and validate", () => {
      // Use a path that we know exists in home directory
      const homeDir = os.homedir();
      const result = validateProjectPath("~");
      expect(result.valid).toBe(true);
      expect(result.expandedPath).toBe(homeDir);
      expect(result.error).toBeUndefined();
    });

    it("should return error for non-existent path", () => {
      const nonExistentPath = "/this/path/definitely/does/not/exist/cmux-test-12345";
      const result = validateProjectPath(nonExistentPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return error for file path (not directory)", () => {
      const filePath = path.join(tempDir, "test-file.txt");
      // eslint-disable-next-line local/no-sync-fs-methods -- Test setup only
      fs.writeFileSync(filePath, "test content");
      
      const result = validateProjectPath(filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not a directory");
    });

    it("should handle tilde path to non-existent directory", () => {
      const nonExistentTildePath = "~/this-directory-should-not-exist-cmux-test-12345";
      const result = validateProjectPath(nonExistentTildePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return normalized absolute path", () => {
      const pathWithDots = path.join(tempDir, "..", path.basename(tempDir));
      const result = validateProjectPath(pathWithDots);
      expect(result.valid).toBe(true);
      expect(result.expandedPath).toBe(tempDir);
    });
  });
});

