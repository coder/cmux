import { load_config_or_default, findWorkspacePath } from "../config";
import * as path from "path";
import * as fs from "fs";

export function listWorkspacesCommand() {
  const config = load_config_or_default();

  console.log("\n=== Configuration Debug ===\n");
  console.log("Projects in config:", config.projects.size);

  for (const [projectPath, project] of config.projects) {
    const projectName = path.basename(projectPath);
    console.log(`\nProject: ${projectName}`);
    console.log(`  Path: ${projectPath}`);
    console.log(`  Workspaces: ${project.workspaces.length}`);

    for (const workspace of project.workspaces) {
      console.log(`    - Branch: ${workspace.branch}`);
      console.log(`      Path: ${workspace.path}`);
      console.log(`      Exists: ${fs.existsSync(workspace.path)}`);
    }
  }

  console.log("\n=== Testing findWorkspacePath ===\n");

  // Test finding specific workspaces
  const testCases = [
    { project: "cmux", branch: "colors" },
    { project: "cmux", branch: "main" },
    { project: "cmux", branch: "fix" },
    { project: "cmux", branch: "markdown" },
  ];

  for (const test of testCases) {
    const result = findWorkspacePath(test.project, test.branch);
    console.log(`findWorkspacePath('${test.project}', '${test.branch}'):`);
    if (result) {
      console.log(`  Found: ${result}`);
      console.log(`  Exists: ${fs.existsSync(result)}`);
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
