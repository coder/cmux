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

  describe("symlink management", () => {
    let projectPath: string;
    let projectDir: string;

    beforeEach(() => {
      projectPath = "/fake/project";
      const projectName = "project";
      projectDir = path.join(config.srcDir, projectName);
      fs.mkdirSync(projectDir, { recursive: true });
    });

    it("should create a symlink from name to ID", () => {
      const id = "abc123def4";
      const name = "feature-branch";
      const idPath = path.join(projectDir, id);
      const symlinkPath = path.join(projectDir, name);

      // Create the actual ID directory
      fs.mkdirSync(idPath);

      // Create symlink
      config.createWorkspaceSymlink(projectPath, id, name);

      // Verify symlink exists and points to ID
      expect(fs.existsSync(symlinkPath)).toBe(true);
      const stats = fs.lstatSync(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(symlinkPath)).toBe(id);
    });

    it("should update a symlink when renaming", () => {
      const id = "abc123def4";
      const oldName = "old-name";
      const newName = "new-name";
      const idPath = path.join(projectDir, id);
      const oldSymlinkPath = path.join(projectDir, oldName);
      const newSymlinkPath = path.join(projectDir, newName);

      // Create the actual ID directory and initial symlink
      fs.mkdirSync(idPath);
      fs.symlinkSync(id, oldSymlinkPath, "dir");

      // Update symlink
      config.updateWorkspaceSymlink(projectPath, oldName, newName, id);

      // Verify old symlink removed and new one created
      expect(fs.existsSync(oldSymlinkPath)).toBe(false);
      expect(fs.existsSync(newSymlinkPath)).toBe(true);
      const stats = fs.lstatSync(newSymlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(newSymlinkPath)).toBe(id);
    });

    it("should remove a symlink", () => {
      const id = "abc123def4";
      const name = "feature-branch";
      const idPath = path.join(projectDir, id);
      const symlinkPath = path.join(projectDir, name);

      // Create the actual ID directory and symlink
      fs.mkdirSync(idPath);
      fs.symlinkSync(id, symlinkPath, "dir");

      // Remove symlink
      config.removeWorkspaceSymlink(projectPath, name);

      // Verify symlink removed but ID directory still exists
      expect(fs.existsSync(symlinkPath)).toBe(false);
      expect(fs.existsSync(idPath)).toBe(true);
    });

    it("should handle removing non-existent symlink gracefully", () => {
      const name = "nonexistent";
      expect(() => {
        config.removeWorkspaceSymlink(projectPath, name);
      }).not.toThrow();
    });

    it("should replace existing symlink when creating", () => {
      const id = "abc123def4";
      const name = "feature-branch";
      const idPath = path.join(projectDir, id);
      const symlinkPath = path.join(projectDir, name);

      // Create the actual ID directory
      fs.mkdirSync(idPath);

      // Create initial symlink to different target
      fs.symlinkSync("different-id", symlinkPath, "dir");

      // Create new symlink (should replace old one)
      config.createWorkspaceSymlink(projectPath, id, name);

      // Verify symlink now points to new ID
      expect(fs.existsSync(symlinkPath)).toBe(true);
      expect(fs.readlinkSync(symlinkPath)).toBe(id);
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
          path: projectPath,
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

      // Verify metadata file was created
      const sessionDir = config.getSessionDir("project-feature-branch");
      const metadataPath = path.join(sessionDir, "metadata.json");
      expect(fs.existsSync(metadataPath)).toBe(true);

      const savedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as {
        id: string;
        name: string;
      };
      expect(savedMetadata.id).toBe("project-feature-branch");
      expect(savedMetadata.name).toBe("feature-branch");
    });

    it("should use existing metadata file if present", () => {
      const projectPath = "/fake/project";
      const workspaceId = "abc123def4";
      const workspacePath = path.join(config.srcDir, "project", workspaceId);

      // Create workspace directory
      fs.mkdirSync(workspacePath, { recursive: true });

      // Create metadata file manually
      const sessionDir = config.getSessionDir(workspaceId);
      fs.mkdirSync(sessionDir, { recursive: true });
      const metadataPath = path.join(sessionDir, "metadata.json");
      const existingMetadata = {
        id: workspaceId,
        name: "my-feature",
        projectName: "project",
        workspacePath: workspacePath,
        createdAt: "2025-01-01T00:00:00.000Z",
      };
      fs.writeFileSync(metadataPath, JSON.stringify(existingMetadata));

      // Add workspace to config
      config.editConfig((cfg) => {
        cfg.projects.set(projectPath, {
          path: projectPath,
          workspaces: [{ path: workspacePath }],
        });
        return cfg;
      });

      // Get all metadata (should use existing metadata)
      const allMetadata = config.getAllWorkspaceMetadata();

      expect(allMetadata).toHaveLength(1);
      const metadata = allMetadata[0];
      expect(metadata.id).toBe(workspaceId);
      expect(metadata.name).toBe("my-feature");
      expect(metadata.createdAt).toBe("2025-01-01T00:00:00.000Z");
    });
  });
});
