import { describe, test, expect } from "bun:test";
import type { Runtime } from "@/runtime/Runtime";
import { listScripts } from "./discovery";

// Mock runtime for testing
function createMockRuntime(responses: Map<string, { stdout: string; exitCode: number }>): Runtime {
  const runtime: Runtime = {
    exec: (command: string) => {
      const response = responses.get(command) ?? { stdout: "", exitCode: 1 };
      return Promise.resolve({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(response.stdout));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        stdin: new WritableStream(),
        exitCode: Promise.resolve(response.exitCode),
        duration: Promise.resolve(0),
      });
    },
    readFile: () => {
      throw new Error("readFile not implemented in mock");
    },
    writeFile: () => {
      throw new Error("writeFile not implemented in mock");
    },
    stat: () => {
      throw new Error("stat not implemented in mock");
    },
    resolvePath: () => {
      throw new Error("resolvePath not implemented in mock");
    },
    normalizePath: () => {
      throw new Error("normalizePath not implemented in mock");
    },
    getWorkspacePath: () => {
      throw new Error("getWorkspacePath not implemented in mock");
    },
    createWorkspace: () => {
      throw new Error("createWorkspace not implemented in mock");
    },
    initWorkspace: () => {
      throw new Error("initWorkspace not implemented in mock");
    },
    forkWorkspace: () => {
      throw new Error("forkWorkspace not implemented in mock");
    },
    deleteWorkspace: () => {
      throw new Error("deleteWorkspace not implemented in mock");
    },
    renameWorkspace: () => {
      throw new Error("renameWorkspace not implemented in mock");
    },
  };
  return runtime;
}

describe("listScripts", () => {
  test("returns empty array when scripts directory doesn't exist", async () => {
    const runtime = createMockRuntime(
      new Map([
        [
          "find \"/test/workspace/.cmux/scripts\" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null | sort || true",
          { stdout: "", exitCode: 1 },
        ],
      ])
    );

    const scripts = await listScripts(runtime, "/test/workspace");
    expect(scripts).toEqual([]);
  });

  test("discovers scripts with descriptions", async () => {
    const runtime = createMockRuntime(
      new Map([
        [
          "find \"/test/workspace/.cmux/scripts\" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null | sort || true",
          { stdout: "deploy\ntest.sh\n", exitCode: 0 },
        ],
        [
          'test -x "/test/workspace/.cmux/scripts/deploy" && echo "true" || echo "false"',
          { stdout: "true\n", exitCode: 0 },
        ],
        [
          'head -n 20 "/test/workspace/.cmux/scripts/deploy" 2>/dev/null || true',
          {
            stdout: "#!/bin/bash\n# Description: Deploy the application\necho 'deploying...'\n",
            exitCode: 0,
          },
        ],
        [
          'test -x "/test/workspace/.cmux/scripts/test.sh" && echo "true" || echo "false"',
          { stdout: "false\n", exitCode: 0 },
        ],
        [
          'head -n 20 "/test/workspace/.cmux/scripts/test.sh" 2>/dev/null || true',
          { stdout: "#!/bin/bash\n# Run tests\necho 'testing...'\n", exitCode: 0 },
        ],
      ])
    );

    const scripts = await listScripts(runtime, "/test/workspace");
    expect(scripts).toEqual([
      {
        name: "deploy",
        description: "Deploy the application",
        isExecutable: true,
      },
      {
        name: "test.sh",
        description: "Run tests",
        isExecutable: false,
      },
    ]);
  });

  test("handles scripts with @description annotation", async () => {
    const runtime = createMockRuntime(
      new Map([
        [
          "find \"/test/workspace/.cmux/scripts\" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null | sort || true",
          { stdout: "build\n", exitCode: 0 },
        ],
        [
          'test -x "/test/workspace/.cmux/scripts/build" && echo "true" || echo "false"',
          { stdout: "true\n", exitCode: 0 },
        ],
        [
          'head -n 20 "/test/workspace/.cmux/scripts/build" 2>/dev/null || true',
          {
            stdout: "#!/bin/bash\n# @description Build the project\necho 'building...'\n",
            exitCode: 0,
          },
        ],
      ])
    );

    const scripts = await listScripts(runtime, "/test/workspace");
    expect(scripts).toEqual([
      {
        name: "build",
        description: "Build the project",
        isExecutable: true,
      },
    ]);
  });

  test("handles scripts without descriptions", async () => {
    const runtime = createMockRuntime(
      new Map([
        [
          "find \"/test/workspace/.cmux/scripts\" -maxdepth 1 -type f -printf '%f\\n' 2>/dev/null | sort || true",
          { stdout: "script\n", exitCode: 0 },
        ],
        [
          'test -x "/test/workspace/.cmux/scripts/script" && echo "true" || echo "false"',
          { stdout: "true\n", exitCode: 0 },
        ],
        [
          'head -n 20 "/test/workspace/.cmux/scripts/script" 2>/dev/null || true',
          { stdout: "#!/bin/bash\necho 'no description'\n", exitCode: 0 },
        ],
      ])
    );

    const scripts = await listScripts(runtime, "/test/workspace");
    expect(scripts).toEqual([
      {
        name: "script",
        description: undefined,
        isExecutable: true,
      },
    ]);
  });
});
