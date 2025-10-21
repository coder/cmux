#!/usr/bin/env bun
/**
 * Screenshot Storybook Stories
 * 
 * This script:
 * 1. Builds or starts Storybook
 * 2. Uses Playwright to visit each story
 * 3. Takes screenshots of all stories
 * 4. Optionally uploads them to GitHub
 * 
 * Usage:
 *   bun scripts/screenshot-storybook.ts
 *   bun scripts/screenshot-storybook.ts --upload --issue 123
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

interface Story {
  id: string;
  title: string;
  name: string;
  kind: string;
}

interface ScreenshotResult {
  story: Story;
  path: string;
  url: string;
}

const STORYBOOK_URL = process.env.STORYBOOK_URL || "http://localhost:6006";
const SCREENSHOTS_DIR = join(process.cwd(), "artifacts", "storybook-screenshots");
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Start Storybook server in the background
 */
async function startStorybook(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    console.log("Starting Storybook server...");
    const storybookProcess = spawn("bun", ["x", "storybook", "dev", "-p", "6006", "--ci"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes("Local:") || output.includes("ready")) {
        console.log("✓ Storybook is ready");
        storybookProcess.stdout?.off("data", onData);
        storybookProcess.stderr?.off("data", onData);
        
        const cleanup = () => {
          console.log("Stopping Storybook server...");
          storybookProcess.kill();
        };
        
        resolve(cleanup);
      }
    };

    storybookProcess.stdout?.on("data", onData);
    storybookProcess.stderr?.on("data", onData);

    storybookProcess.on("error", reject);
    
    // Timeout after 60 seconds
    setTimeout(() => {
      storybookProcess.kill();
      reject(new Error("Storybook failed to start within 60 seconds"));
    }, 60000);
  });
}

/**
 * Wait for network to be idle
 */
async function waitForStorybook(page: Page): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    // Give extra time for animations/transitions
    await page.waitForTimeout(500);
  } catch (e) {
    console.warn("Network didn't become idle, continuing anyway");
  }
}

/**
 * Fetch all stories from Storybook
 */
async function getStories(page: Page): Promise<Story[]> {
  // Navigate to Storybook
  await page.goto(STORYBOOK_URL);
  await waitForStorybook(page);

  // Access Storybook's internal API to get all stories
  const stories = await page.evaluate(() => {
    // @ts-expect-error - Accessing Storybook global
    const preview = window.__STORYBOOK_PREVIEW__;
    if (!preview) {
      throw new Error("Storybook preview not found");
    }

    const storyStore = preview.storyStore;
    const allStories: Story[] = [];

    // Extract all stories from the store
    Object.entries(storyStore.stories || {}).forEach(([id, story]: [string, any]) => {
      allStories.push({
        id,
        title: story.title,
        name: story.name,
        kind: story.kind || story.title,
      });
    });

    return allStories;
  });

  return stories;
}

/**
 * Screenshot a single story
 */
async function screenshotStory(
  page: Page,
  story: Story,
  outputDir: string
): Promise<ScreenshotResult> {
  const url = `${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story`;
  
  console.log(`  Screenshotting: ${story.title} / ${story.name}`);
  
  await page.goto(url);
  await waitForStorybook(page);

  // Create a safe filename
  const filename = `${story.id.replace(/[^a-z0-9-]/gi, "_")}.png`;
  const filepath = join(outputDir, filename);

  await page.screenshot({
    path: filepath,
    fullPage: false,
  });

  return {
    story,
    path: filepath,
    url,
  };
}

/**
 * Main screenshot function
 */
async function screenshotAllStories(): Promise<ScreenshotResult[]> {
  // Ensure output directory exists
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  let cleanup: (() => void) | null = null;
  let browser: Browser | null = null;

  try {
    // Start Storybook if not already running
    cleanup = await startStorybook();

    // Launch browser
    console.log("Launching browser...");
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
    });

    const page = await context.newPage();

    // Get all stories
    console.log("Fetching stories...");
    const stories = await getStories(page);
    console.log(`Found ${stories.length} stories\n`);

    // Screenshot each story
    const results: ScreenshotResult[] = [];
    for (const story of stories) {
      try {
        const result = await screenshotStory(page, story, SCREENSHOTS_DIR);
        results.push(result);
      } catch (error) {
        console.error(`  ✗ Failed to screenshot ${story.id}:`, error);
      }
    }

    console.log(`\n✓ Successfully captured ${results.length}/${stories.length} screenshots`);
    console.log(`  Screenshots saved to: ${SCREENSHOTS_DIR}`);

    // Save manifest
    const manifest = {
      timestamp: new Date().toISOString(),
      viewport: VIEWPORT,
      storybookUrl: STORYBOOK_URL,
      screenshots: results.map((r) => ({
        id: r.story.id,
        title: r.story.title,
        name: r.story.name,
        filename: r.path.split("/").pop(),
        url: r.url,
      })),
    };

    const manifestPath = join(SCREENSHOTS_DIR, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  Manifest saved to: ${manifestPath}`);

    return results;
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    if (cleanup) {
      cleanup();
    }
  }
}

/**
 * Upload screenshots to GitHub issue
 */
async function uploadToGitHub(results: ScreenshotResult[], issueNumber: number): Promise<void> {
  console.log(`\nUploading ${results.length} screenshots to issue #${issueNumber}...`);

  const { Octokit } = await import("@octokit/rest");
  const { readFile } = await import("fs/promises");

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required for upload");
  }

  // Get repo info from git
  const { execSync } = await import("child_process");
  const remoteUrl = execSync("git config --get remote.origin.url").toString().trim();
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  
  if (!match) {
    throw new Error("Could not parse GitHub owner/repo from remote URL");
  }

  const [, owner, repo] = match;

  const octokit = new Octokit({ auth: token });

  // Group screenshots by component
  const grouped = new Map<string, ScreenshotResult[]>();
  for (const result of results) {
    const key = result.story.title;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(result);
  }

  // Build markdown comment with all screenshots
  let comment = "## 📸 Storybook Screenshots\n\n";
  comment += `Generated: ${new Date().toISOString()}\n`;
  comment += `Total stories: ${results.length}\n\n`;

  for (const [title, stories] of Array.from(grouped.entries())) {
    comment += `### ${title}\n\n`;
    
    for (const result of stories) {
      try {
        // Upload image as an asset
        const imageData = await readFile(result.path);
        const filename = result.path.split("/").pop()!;
        
        // Upload to issue as attachment (GitHub automatically hosts these)
        comment += `#### ${result.story.name}\n`;
        comment += `![${result.story.name}](${result.path})\n`;
        comment += `[View in Storybook](${result.url})\n\n`;
        
        console.log(`  ✓ Prepared ${filename}`);
      } catch (error) {
        console.error(`  ✗ Failed to prepare ${result.story.id}:`, error);
      }
    }
  }

  comment += "\n_Generated with `cmux`_ 🤖\n";

  // Post comment to issue
  console.log(`\nPosting comment to issue #${issueNumber}...`);
  
  // Note: GitHub doesn't support direct image upload via API for issues
  // We'll save the markdown and let users manually upload or use a different approach
  const commentPath = join(SCREENSHOTS_DIR, "github-comment.md");
  writeFileSync(commentPath, comment);
  
  console.log(`\n⚠️  GitHub API doesn't support direct image upload to issues.`);
  console.log(`    Comment template saved to: ${commentPath}`);
  console.log(`\nTo share screenshots:`);
  console.log(`  1. Use GitHub's drag-and-drop to upload images to an issue/PR comment`);
  console.log(`  2. Or host images externally (imgur, cloudinary, etc.)`);
  console.log(`  3. Or commit screenshots to repo and link them`);
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const shouldUpload = args.includes("--upload");
  const issueIndex = args.indexOf("--issue");
  const issueNumber = issueIndex >= 0 ? parseInt(args[issueIndex + 1]) : undefined;

  try {
    const results = await screenshotAllStories();

    if (shouldUpload && issueNumber) {
      await uploadToGitHub(results, issueNumber);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n✗ Error:", error);
    process.exit(1);
  }
}

main();

