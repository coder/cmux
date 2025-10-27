import { describe, expect, it } from "bun:test";
import * as os from "os";
import * as path from "path";
import { LocalRuntime } from "./LocalRuntime";

describe("LocalRuntime constructor", () => {
  it("should expand tilde in srcBaseDir", () => {
    const runtime = new LocalRuntime("~/workspace");
    const workspacePath = runtime.getWorkspacePath("/home/user/project", "branch");
    
    // The workspace path should use the expanded home directory
    const expected = path.join(os.homedir(), "workspace", "project", "branch");
    expect(workspacePath).toBe(expected);
  });

  it("should handle absolute paths without expansion", () => {
    const runtime = new LocalRuntime("/absolute/path");
    const workspacePath = runtime.getWorkspacePath("/home/user/project", "branch");
    
    const expected = path.join("/absolute/path", "project", "branch");
    expect(workspacePath).toBe(expected);
  });

  it("should handle bare tilde", () => {
    const runtime = new LocalRuntime("~");
    const workspacePath = runtime.getWorkspacePath("/home/user/project", "branch");
    
    const expected = path.join(os.homedir(), "project", "branch");
    expect(workspacePath).toBe(expected);
  });
});
