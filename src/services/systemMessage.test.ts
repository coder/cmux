import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { buildSystemMessage } from "./systemMessage";
import type { WorkspaceMetadata } from "@/types/workspace";
import { spyOn, describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Mock } from "bun:test";

describe("buildSystemMessage", () => {
  let tempDir: string;
  let workspaceDir: string;
  let globalDir: string;
  let mockHomedir: Mock<typeof os.homedir>;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "systemMessage-test-"));
    workspaceDir = path.join(tempDir, "workspace");
    globalDir = path.join(tempDir, ".cmux");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(globalDir, { recursive: true });

    // Mock homedir to return our test directory (getSystemDirectory will append .cmux)
    mockHomedir = spyOn(os, "homedir");
    mockHomedir.mockReturnValue(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    // Restore the original homedir
    mockHomedir?.mockRestore();
  });

  test("includes mode-specific section when mode is provided", async () => {
    // Write instruction file with mode section
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `# General Instructions
Always be helpful.

## Mode: Plan
Focus on planning and design.
Use diagrams where appropriate.
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, { mode: "plan" });

    // Should include the mode-specific content
    expect(systemMessage).toContain("<plan>");
    expect(systemMessage).toContain("Focus on planning and design");
    expect(systemMessage).toContain("Use diagrams where appropriate");
    expect(systemMessage).toContain("</plan>");

    // Should also include general instructions
    expect(systemMessage).toContain("Always be helpful");
  });

  test("excludes mode-specific section when mode is not provided", async () => {
    // Write instruction file with mode section
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `# General Instructions
Always be helpful.

## Mode: Plan
Focus on planning and design.
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir);

    // Should NOT include the <plan> mode-specific tag
    expect(systemMessage).not.toContain("<plan>");
    expect(systemMessage).not.toContain("</plan>");

    // All instructions are still in <custom-instructions> (both general and mode section)
    expect(systemMessage).toContain("Always be helpful");
    expect(systemMessage).toContain("Focus on planning and design");
  });

  test("prefers workspace mode section over global mode section", async () => {
    // Write global instruction file with mode section
    await fs.writeFile(
      path.join(globalDir, "AGENTS.md"),
      `# Global Instructions

## Mode: Plan
Global plan instructions.
`
    );

    // Write workspace instruction file with mode section
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `# Workspace Instructions

## Mode: Plan
Workspace plan instructions (should win).
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, { mode: "plan" });

    // Should include workspace mode section in the <plan> tag (workspace wins)
    expect(systemMessage).toMatch(/<plan>\s*Workspace plan instructions \(should win\)\./s);
    // Global instructions are still present in <custom-instructions> section (that's correct)
    // But the mode-specific <plan> section should only have workspace content
    expect(systemMessage).not.toMatch(/<plan>[^<]*Global plan instructions/s);
  });

  test("falls back to global mode section when workspace has none", async () => {
    // Write global instruction file with mode section
    await fs.writeFile(
      path.join(globalDir, "AGENTS.md"),
      `# Global Instructions

## Mode: Plan
Global plan instructions.
`
    );

    // Write workspace instruction file WITHOUT mode section
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `# Workspace Instructions
Just general workspace stuff.
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, { mode: "plan" });

    // Should include global mode section as fallback
    expect(systemMessage).toContain("Global plan instructions");
  });

  test("handles mode with special characters by sanitizing tag name", async () => {
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `## Mode: My-Special_Mode!
Special mode instructions.
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, {
      mode: "My-Special_Mode!",
    });

    // Tag should be sanitized to only contain valid characters
    expect(systemMessage).toContain("<my-special_mode->");
    expect(systemMessage).toContain("Special mode instructions");
    expect(systemMessage).toContain("</my-special_mode->");
  });

  test("includes agent name in prelude when provided", async () => {
    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, {
      agentName: "CodeAssistant",
    });

    // Should include the agent name in the prelude
    expect(systemMessage).toContain("Your name is CodeAssistant.");
    expect(systemMessage).toContain("You are a coding agent.");
  });

  test("excludes agent name from prelude when not provided", async () => {
    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir);

    // Should NOT include "Your name is"
    expect(systemMessage).not.toContain("Your name is");
    expect(systemMessage).toContain("You are a coding agent.");
  });

  test("combines multiple options (mode, agentName, additionalSystemInstructions)", async () => {
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      `## Mode: Plan
Plan mode content.
`
    );

    const metadata: WorkspaceMetadata = {
      id: "test-workspace",
      name: "test-workspace",
      projectName: "test-project",
      projectPath: tempDir,
    };

    const systemMessage = await buildSystemMessage(metadata, workspaceDir, {
      mode: "plan",
      agentName: "PlanBot",
      additionalSystemInstructions: "Be extra careful with security.",
    });

    // Should include all three options
    expect(systemMessage).toContain("Your name is PlanBot.");
    expect(systemMessage).toContain("<plan>");
    expect(systemMessage).toContain("Plan mode content.");
    expect(systemMessage).toContain("<additional-instructions>");
    expect(systemMessage).toContain("Be extra careful with security.");
  });
});
