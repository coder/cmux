import { defaultConfig } from "@/config";
import * as path from "path";
import * as fs from "fs";

export function listWorkspacesCommand() {
  const config = defaultConfig.loadConfigOrDefault();

  console.log("\n=== Configuration Debug ===\n");
  console.log("Projects in config:", config.projects.size);

  for (const [projectPath, project] of config.projects) {
    const projectName = path.basename(projectPath);
    console.log(`\nProject: ${projectName}`);
    console.log(`  Path: ${projectPath}`);
    console.log(`  Workspaces: ${project.workspaces.length}`);

    for (const workspace of project.workspaces) {
      // Note: This generates legacy-format IDs for display. Actual workspace IDs come from
      // metadata.json (stable IDs) or config.json (migrated workspaces).
      const workspaceId = defaultConfig.generateWorkspaceId(projectPath, workspace.path);
      console.log(`    - Legacy ID: ${workspaceId} (for lookup only)`);
      console.log(`      Path: ${workspace.path}`);
      console.log(`      Exists: ${fs.existsSync(workspace.path)}`);
    }
  }

  console.log("\n=== Testing findWorkspace ===\n");

  // Test finding specific workspaces by ID
  const testCases = ["cmux-colors", "cmux-main", "cmux-fix", "cmux-markdown"];

  for (const workspaceId of testCases) {
    const result = defaultConfig.findWorkspace(workspaceId);
    console.log(`findWorkspace('${workspaceId}'):`);
    if (result) {
      console.log(`  Found: ${result.workspacePath}`);
      console.log(`  Project: ${result.projectPath}`);
      console.log(`  Exists: ${fs.existsSync(result.workspacePath)}`);
    } else {
      console.log(`  Not found!`);
    }
  }

  console.log("\n=== Sessions Directory ===\n");
  const sessionsDir = path.join(process.env.HOME ?? "", ".cmux", "sessions");
  if (fs.existsSync(sessionsDir)) {
    const sessions = fs.readdirSync(sessionsDir);
    console.log(`Sessions in ${sessionsDir}:`);
    for (const session of sessions) {
      console.log(`  - ${session}`);
    }
  } else {
    console.log("Sessions directory does not exist");
  }
}
