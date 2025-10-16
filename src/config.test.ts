import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Config } from "./config";

describe("Config", () => {
  let tempDir: string;
  let config: Config;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-test-"));
    config = new Config(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateStableId", () => {
    it("should generate a 10-character hex string", () => {
      const id = config.generateStableId();
      expect(id).toMatch(/^[0-9a-f]{10}$/);
    });

    it("should generate unique IDs", () => {
      const id1 = config.generateStableId();
      const id2 = config.generateStableId();
      const id3 = config.generateStableId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe("getAllWorkspaceMetadata with migration", () => {
    it("should migrate legacy workspace without metadata file", () => {
      const projectPath = "/fake/project";
      const workspacePath = path.join(config.srcDir, "project", "feature-branch");

      // Create workspace directory
      fs.mkdirSync(workspacePath, { recursive: true });

      // Add workspace to config without metadata file
      config.editConfig((cfg) => {
        cfg.projects.set(projectPath, {
          workspaces: [{ path: workspacePath }],
        });
        return cfg;
      });

      // Get all metadata (should trigger migration)
      const allMetadata = config.getAllWorkspaceMetadata();

      expect(allMetadata).toHaveLength(1);
      const metadata = allMetadata[0];
      expect(metadata.id).toBe("project-feature-branch"); // Legacy ID format
      expect(metadata.name).toBe("feature-branch");
      expect(metadata.projectName).toBe("project");
      expect(metadata.projectPath).toBe(projectPath);

      // Verify metadata was migrated to config
      const configData = config.loadConfigOrDefault();
      const projectConfig = configData.projects.get(projectPath);
      expect(projectConfig).toBeDefined();
      expect(projectConfig!.workspaces).toHaveLength(1);
      const workspace = projectConfig!.workspaces[0];
      expect(workspace.id).toBe("project-feature-branch");
      expect(workspace.name).toBe("feature-branch");
    });

    it("should use existing metadata file if present (legacy format)", () => {
      const projectPath = "/fake/project";
      const workspaceName = "my-feature";
      const workspacePath = path.join(config.srcDir, "project", workspaceName);

      // Create workspace directory
      fs.mkdirSync(workspacePath, { recursive: true });

      // Create metadata file using legacy ID format (project-workspace)
      const legacyId = config.generateWorkspaceId(projectPath, workspacePath);
      const sessionDir = config.getSessionDir(legacyId);
      fs.mkdirSync(sessionDir, { recursive: true });
      const metadataPath = path.join(sessionDir, "metadata.json");
      const existingMetadata = {
        id: legacyId,
        name: workspaceName,
        projectName: "project",
        projectPath: projectPath,
        createdAt: "2025-01-01T00:00:00.000Z",
      };
      fs.writeFileSync(metadataPath, JSON.stringify(existingMetadata));

      // Add workspace to config (without id/name, simulating legacy format)
      config.editConfig((cfg) => {
        cfg.projects.set(projectPath, {
          workspaces: [{ path: workspacePath }],
        });
        return cfg;
      });

      // Get all metadata (should use existing metadata and migrate to config)
      const allMetadata = config.getAllWorkspaceMetadata();

      expect(allMetadata).toHaveLength(1);
      const metadata = allMetadata[0];
      expect(metadata.id).toBe(legacyId);
      expect(metadata.name).toBe(workspaceName);
      expect(metadata.createdAt).toBe("2025-01-01T00:00:00.000Z");

      // Verify metadata was migrated to config
      const configData = config.loadConfigOrDefault();
      const projectConfig = configData.projects.get(projectPath);
      expect(projectConfig).toBeDefined();
      expect(projectConfig!.workspaces).toHaveLength(1);
      const workspace = projectConfig!.workspaces[0];
      expect(workspace.id).toBe(legacyId);
      expect(workspace.name).toBe(workspaceName);
      expect(workspace.createdAt).toBe("2025-01-01T00:00:00.000Z");
    });
  });
});
