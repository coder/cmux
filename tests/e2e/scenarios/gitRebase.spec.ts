import { electronTest as test, electronExpect as expect } from "../electronTest";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Electron scenario runs on chromium only"
);

test("visual rebase indicator shows and works when workspace is behind", async ({
  ui,
  workspace,
  page,
}) => {
  // Open the workspace
  await ui.projects.openFirstWorkspace();

  // Get the workspace path from the demo project
  const workspacePath = workspace.demoProject.workspacePath;
  const projectPath = workspace.demoProject.projectPath;

  // Create an upstream commit to make workspace behind
  await execAsync(`echo "upstream change" >> upstream.txt`, { cwd: projectPath });
  await execAsync(`git add . && git commit -m "Upstream commit"`, { cwd: projectPath });

  // Fetch in the workspace to see the upstream change
  await execAsync(`git fetch origin`, { cwd: workspacePath });

  // Wait a moment for the UI to update git status
  await page.waitForTimeout(2000);

  // Look for the behind indicator (↓N) in the UI
  // The git status indicator should show we're behind
  const gitIndicator = page.locator("text=/↓[0-9]+/");
  await expect(gitIndicator).toBeVisible({ timeout: 10000 });

  // Get the behind count
  const indicatorText = await gitIndicator.textContent();
  const behindMatch = indicatorText?.match(/↓(\d+)/);
  expect(behindMatch).toBeTruthy();
  const behindCount = parseInt(behindMatch![1]);
  expect(behindCount).toBeGreaterThan(0);

  // Hover over the indicator to see the refresh icon
  await gitIndicator.hover();

  // Wait a moment for hover effect
  await page.waitForTimeout(500);

  // The indicator should change to show refresh icon on hover (🔄)
  // Check that the element has cursor: pointer styling (indicates it's clickable)
  const cursorStyle = await gitIndicator.evaluate((el) => {
    return window.getComputedStyle(el).cursor;
  });
  expect(cursorStyle).toBe("pointer");

  // Verify the tooltip shows it's clickable
  const tooltip = await gitIndicator.getAttribute("title");
  expect(tooltip).toContain("rebase");

  // Click the indicator to trigger rebase
  await gitIndicator.click();

  // Wait for rebase to complete (should be quick since no conflicts)
  // The behind indicator should disappear or update
  await page.waitForTimeout(3000);

  // Verify the workspace is no longer behind
  // The indicator should either be gone or show ↓0 (which means it won't display)
  const { stdout: afterStatus } = await execAsync(
    `git -C "${workspacePath}" rev-list --left-right --count HEAD...origin/main`
  );
  const [aheadAfter, behindAfter] = afterStatus.trim().split("\t").map(Number);
  expect(behindAfter).toBe(0);

  // The git indicator should no longer show the behind arrow
  const behindIndicatorAfter = page.locator("text=/↓[1-9][0-9]*/");
  await expect(behindIndicatorAfter).not.toBeVisible({ timeout: 5000 });
});

test("visual rebase indicator shows refresh icon on hover", async ({ ui, workspace, page }) => {
  await ui.projects.openFirstWorkspace();

  const workspacePath = workspace.demoProject.workspacePath;
  const projectPath = workspace.demoProject.projectPath;

  // Create upstream commit
  await execAsync(`echo "change" >> test.txt`, { cwd: projectPath });
  await execAsync(`git add . && git commit -m "Test"`, { cwd: projectPath });
  await execAsync(`git fetch origin`, { cwd: workspacePath });

  // Wait for UI update
  await page.waitForTimeout(2000);

  // Find the git status indicator
  const gitIndicator = page.locator("text=/↓[0-9]+/");
  await expect(gitIndicator).toBeVisible({ timeout: 10000 });

  // Before hover: should show ↓N
  const beforeHoverText = await gitIndicator.textContent();
  expect(beforeHoverText).toMatch(/↓\d+/);

  // Hover to trigger refresh icon
  await gitIndicator.hover();
  await page.waitForTimeout(500);

  // After hover: should show 🔄 (refresh icon)
  // We can check if the refresh icon is visible by looking for the emoji
  const refreshIcon = gitIndicator.locator("text=🔄");
  await expect(refreshIcon).toBeVisible({ timeout: 2000 });

  // The arrow text should be hidden
  const arrowText = gitIndicator.locator(".arrow-text");
  const isArrowVisible = await arrowText.isVisible().catch(() => false);
  expect(isArrowVisible).toBe(false);

  // Move mouse away
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);

  // Should revert back to showing ↓N
  const afterHoverText = await gitIndicator.textContent();
  expect(afterHoverText).toMatch(/↓\d+/);
});

test("rebase handles uncommitted changes (stash and restore)", async ({ ui, workspace, page }) => {
  await ui.projects.openFirstWorkspace();

  const workspacePath = workspace.demoProject.workspacePath;
  const projectPath = workspace.demoProject.projectPath;

  // Create upstream commit
  await execAsync(`echo "upstream" >> upstream.txt`, { cwd: projectPath });
  await execAsync(`git add . && git commit -m "Upstream"`, { cwd: projectPath });

  // Create uncommitted changes in workspace
  const uncommittedFile = path.join(workspacePath, "uncommitted.txt");
  await execAsync(`echo "my changes" > "${uncommittedFile}"`);

  // Fetch to see upstream
  await execAsync(`git fetch origin`, { cwd: workspacePath });
  await page.waitForTimeout(2000);

  // Find and click rebase indicator
  const gitIndicator = page.locator("text=/↓[0-9]+/");
  await expect(gitIndicator).toBeVisible({ timeout: 10000 });
  await gitIndicator.click();

  // Wait for rebase to complete
  await page.waitForTimeout(3000);

  // Verify uncommitted file still exists with correct content
  const { stdout: fileContent } = await execAsync(`cat "${uncommittedFile}"`);
  expect(fileContent.trim()).toBe("my changes");

  // Verify workspace is now up to date
  const { stdout: status } = await execAsync(
    `git -C "${workspacePath}" rev-list --left-right --count HEAD...origin/main`
  );
  const [, behind] = status.trim().split("\t").map(Number);
  expect(behind).toBe(0);
});

test("rebase shows error in chat when conflicts occur", async ({ ui, workspace, page }) => {
  await ui.projects.openFirstWorkspace();

  const workspacePath = workspace.demoProject.workspacePath;
  const projectPath = workspace.demoProject.projectPath;

  // Create conflicting change in main
  await execAsync(`echo "main version" > conflict.txt`, { cwd: projectPath });
  await execAsync(`git add . && git commit -m "Main"`, { cwd: projectPath });

  // Create conflicting change in workspace
  await execAsync(`echo "workspace version" > conflict.txt`, { cwd: workspacePath });
  await execAsync(`git add . && git commit -m "Workspace"`, { cwd: workspacePath });

  // Fetch to see upstream
  await execAsync(`git fetch origin`, { cwd: workspacePath });
  await page.waitForTimeout(2000);

  // Click rebase indicator
  const gitIndicator = page.locator("text=/↓[0-9]+/");
  await expect(gitIndicator).toBeVisible({ timeout: 10000 });
  await gitIndicator.click();

  // Wait for conflict to be detected
  await page.waitForTimeout(3000);

  // Check that a conflict message appeared in the chat transcript
  const transcript = page.getByRole("log", { name: "Conversation transcript" });
  await expect(transcript).toContainText("Git rebase", { timeout: 10000 });
  await expect(transcript).toContainText("conflicts");
  await expect(transcript).toContainText("conflict.txt");
  await expect(transcript).toContainText("git rebase --continue");
});

test("indicator not clickable when agent is streaming", async ({ ui, workspace, page }) => {
  await ui.projects.openFirstWorkspace();

  const workspacePath = workspace.demoProject.workspacePath;
  const projectPath = workspace.demoProject.projectPath;

  // Create upstream commit
  await execAsync(`echo "change" >> test.txt`, { cwd: projectPath });
  await execAsync(`git add . && git commit -m "Test"`, { cwd: projectPath });
  await execAsync(`git fetch origin`, { cwd: workspacePath });
  await page.waitForTimeout(2000);

  // Start a message to make the agent stream
  await ui.chat.sendMessage("List 3 programming languages");

  // While streaming, find the git indicator
  const gitIndicator = page.locator("text=/↓[0-9]+/");

  // The indicator should not have pointer cursor while streaming
  const cursorWhileStreaming = await gitIndicator
    .evaluate((el) => {
      return window.getComputedStyle(el).cursor;
    })
    .catch(() => "default");

  expect(cursorWhileStreaming).toBe("default");

  // Hover should not show refresh icon while streaming
  await gitIndicator.hover();
  await page.waitForTimeout(500);

  const refreshIcon = gitIndicator.locator("text=🔄");
  const isRefreshVisible = await refreshIcon.isVisible().catch(() => false);
  expect(isRefreshVisible).toBe(false);

  // Wait for stream to complete
  const transcript = page.getByRole("log", { name: "Conversation transcript" });
  await expect(transcript).toContainText("Python", { timeout: 45000 });

  // Now indicator should be clickable again
  const cursorAfterStream = await gitIndicator.evaluate((el) => {
    return window.getComputedStyle(el).cursor;
  });
  expect(cursorAfterStream).toBe("pointer");
});
