/**
 * Runtime integration tests
 *
 * Tests both LocalRuntime and SSHRuntime against the same interface contract.
 * SSH tests use a real Docker container (no mocking) for confidence.
 */

// Jest globals are available automatically - no need to import
import { shouldRunIntegrationTests } from "../testUtils";
import {
  isDockerAvailable,
  startSSHServer,
  stopSSHServer,
  type SSHServerConfig,
} from "./ssh-fixture";
import { createTestRuntime, TestWorkspace, type RuntimeType } from "./test-helpers";
import { execBuffered, readFileString, writeFileString } from "@/utils/runtime/helpers";
import type { Runtime } from "@/runtime/Runtime";
import { RuntimeError } from "@/runtime/Runtime";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// SSH server config (shared across all tests)
let sshConfig: SSHServerConfig | undefined;

describeIntegration("Runtime integration tests", () => {
  beforeAll(async () => {
    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for runtime integration tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container...");
    sshConfig = await startSSHServer();
    console.log(`SSH server ready on port ${sshConfig.port}`);
  }, 60000); // 60s timeout for Docker operations

  afterAll(async () => {
    if (sshConfig) {
      console.log("Stopping SSH server container...");
      await stopSSHServer(sshConfig);
    }
  }, 30000);

  // Test matrix: Run all tests for both local and SSH runtimes
  describe.each<{ type: RuntimeType }>([{ type: "local" }, { type: "ssh" }])(
    "Runtime: $type",
    ({ type }) => {
      // Helper to create runtime for this test type
      const createRuntime = (): Runtime => createTestRuntime(type, sshConfig);

      describe("exec() - Command execution", () => {
        test.concurrent("captures stdout and stderr separately", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, 'echo "output" && echo "error" >&2', {
            cwd: workspace.path,
          });

          expect(result.stdout.trim()).toBe("output");
          expect(result.stderr.trim()).toBe("error");
          expect(result.exitCode).toBe(0);
          expect(result.duration).toBeGreaterThan(0);
        });

        test.concurrent("returns correct exit code for failed commands", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, "exit 42", { cwd: workspace.path });

          expect(result.exitCode).toBe(42);
        });

        test.concurrent("handles stdin input", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, "cat", {
            cwd: workspace.path,
            stdin: "hello from stdin",
          });

          expect(result.stdout).toBe("hello from stdin");
          expect(result.exitCode).toBe(0);
        });

        test.concurrent("passes environment variables", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, 'echo "$TEST_VAR"', {
            cwd: workspace.path,
            env: { TEST_VAR: "test-value" },
          });

          expect(result.stdout.trim()).toBe("test-value");
        });

        test.concurrent("handles empty output", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, "true", { cwd: workspace.path });

          expect(result.stdout).toBe("");
          expect(result.stderr).toBe("");
          expect(result.exitCode).toBe(0);
        });

        test.concurrent("handles commands with quotes and special characters", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, 'echo "hello \\"world\\""', {
            cwd: workspace.path,
          });

          expect(result.stdout.trim()).toBe('hello "world"');
        });

        test.concurrent("respects working directory", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const result = await execBuffered(runtime, "pwd", { cwd: workspace.path });

          expect(result.stdout.trim()).toContain(workspace.path);
        });
      });

      describe("readFile() - File reading", () => {
        test.concurrent("reads file contents", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Write test file
          const testContent = "Hello, World!\nLine 2\nLine 3";
          await writeFileString(runtime, `${workspace.path}/test.txt`, testContent);

          // Read it back
          const content = await readFileString(runtime, `${workspace.path}/test.txt`);

          expect(content).toBe(testContent);
        });

        test.concurrent("reads empty file", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Write empty file
          await writeFileString(runtime, `${workspace.path}/empty.txt`, "");

          // Read it back
          const content = await readFileString(runtime, `${workspace.path}/empty.txt`);

          expect(content).toBe("");
        });

        test.concurrent("reads binary data correctly", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Create binary file with specific bytes
          const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
          const writer = runtime.writeFile(`${workspace.path}/binary.dat`).getWriter();
          await writer.write(binaryData);
          await writer.close();

          // Read it back
          const stream = runtime.readFile(`${workspace.path}/binary.dat`);
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }

          // Concatenate chunks
          const readData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            readData.set(chunk, offset);
            offset += chunk.length;
          }

          expect(readData).toEqual(binaryData);
        });

        test.concurrent("throws RuntimeError for non-existent file", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await expect(
            readFileString(runtime, `${workspace.path}/does-not-exist.txt`)
          ).rejects.toThrow(RuntimeError);
        });

        test.concurrent("throws RuntimeError when reading a directory", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Create subdirectory
          await execBuffered(runtime, `mkdir -p subdir`, { cwd: workspace.path });

          await expect(readFileString(runtime, `${workspace.path}/subdir`)).rejects.toThrow();
        });
      });

      describe("writeFile() - File writing", () => {
        test.concurrent("writes file contents", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const content = "Test content\nLine 2";
          await writeFileString(runtime, `${workspace.path}/output.txt`, content);

          // Verify by reading back
          const result = await execBuffered(runtime, "cat output.txt", {
            cwd: workspace.path,
          });

          expect(result.stdout).toBe(content);
        });

        test.concurrent("overwrites existing file", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const path = `${workspace.path}/overwrite.txt`;

          // Write initial content
          await writeFileString(runtime, path, "original");

          // Overwrite
          await writeFileString(runtime, path, "new content");

          // Verify
          const content = await readFileString(runtime, path);
          expect(content).toBe("new content");
        });

        test.concurrent("writes empty file", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await writeFileString(runtime, `${workspace.path}/empty.txt`, "");

          const content = await readFileString(runtime, `${workspace.path}/empty.txt`);
          expect(content).toBe("");
        });

        test.concurrent("writes binary data", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
          const writer = runtime.writeFile(`${workspace.path}/binary.dat`).getWriter();
          await writer.write(binaryData);
          await writer.close();

          // Verify with wc -c (byte count)
          const result = await execBuffered(runtime, "wc -c < binary.dat", {
            cwd: workspace.path,
          });

          expect(result.stdout.trim()).toBe("6");
        });

        test.concurrent("creates parent directories if needed", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await writeFileString(runtime, `${workspace.path}/nested/dir/file.txt`, "content");

          const content = await readFileString(runtime, `${workspace.path}/nested/dir/file.txt`);
          expect(content).toBe("content");
        });

        test.concurrent("handles special characters in content", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const specialContent = 'Special chars: \n\t"quotes"\'\r\n$VAR`cmd`';
          await writeFileString(runtime, `${workspace.path}/special.txt`, specialContent);

          const content = await readFileString(runtime, `${workspace.path}/special.txt`);
          expect(content).toBe(specialContent);
        });
      });

      describe("stat() - File metadata", () => {
        test.concurrent("returns file metadata", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const content = "Test content";
          await writeFileString(runtime, `${workspace.path}/test.txt`, content);

          const stat = await runtime.stat(`${workspace.path}/test.txt`);

          expect(stat.size).toBe(content.length);
          expect(stat.isDirectory).toBe(false);
          // Check modifiedTime is a valid date (use getTime() to avoid Jest Date issues)
          expect(typeof stat.modifiedTime.getTime).toBe("function");
          expect(stat.modifiedTime.getTime()).toBeGreaterThan(0);
          expect(stat.modifiedTime.getTime()).toBeLessThanOrEqual(Date.now());
        });

        test.concurrent("returns directory metadata", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await execBuffered(runtime, "mkdir subdir", { cwd: workspace.path });

          const stat = await runtime.stat(`${workspace.path}/subdir`);

          expect(stat.isDirectory).toBe(true);
        });

        test.concurrent("throws RuntimeError for non-existent path", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await expect(runtime.stat(`${workspace.path}/does-not-exist`)).rejects.toThrow(
            RuntimeError
          );
        });

        test.concurrent("returns correct size for empty file", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          await writeFileString(runtime, `${workspace.path}/empty.txt`, "");

          const stat = await runtime.stat(`${workspace.path}/empty.txt`);

          expect(stat.size).toBe(0);
          expect(stat.isDirectory).toBe(false);
        });
      });

      describe("Edge cases", () => {
        test.concurrent(
          "handles large files efficiently",
          async () => {
            const runtime = createRuntime();
            await using workspace = await TestWorkspace.create(runtime, type);

            // Create 1MB file
            const largeContent = "x".repeat(1024 * 1024);
            await writeFileString(runtime, `${workspace.path}/large.txt`, largeContent);

            const content = await readFileString(runtime, `${workspace.path}/large.txt`);

            expect(content.length).toBe(1024 * 1024);
            expect(content).toBe(largeContent);
          },
          30000
        );

        test.concurrent("handles concurrent operations", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Run multiple file operations concurrently
          const operations = Array.from({ length: 10 }, async (_, i) => {
            const path = `${workspace.path}/concurrent-${i}.txt`;
            await writeFileString(runtime, path, `content-${i}`);
            const content = await readFileString(runtime, path);
            expect(content).toBe(`content-${i}`);
          });

          await Promise.all(operations);
        });

        test.concurrent("handles paths with spaces", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          const path = `${workspace.path}/file with spaces.txt`;
          await writeFileString(runtime, path, "content");

          const content = await readFileString(runtime, path);
          expect(content).toBe("content");
        });

        test.concurrent("handles very long file paths", async () => {
          const runtime = createRuntime();
          await using workspace = await TestWorkspace.create(runtime, type);

          // Create nested directories
          const longPath = `${workspace.path}/a/b/c/d/e/f/g/h/i/j/file.txt`;
          await writeFileString(runtime, longPath, "nested");

          const content = await readFileString(runtime, longPath);
          expect(content).toBe("nested");
        });
      });
    }
  );
});
