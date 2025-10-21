#!/usr/bin/env bun
/**
 * Screenshot Storybook Stories
 *
 * This script generates screenshots of Storybook stories for use in PRs and documentation.
 *
 * Usage:
 *   bun scripts/screenshot-storybook.ts [options]
 *
 * Options:
 *   --story <name>       Screenshot a specific story (e.g., "modal--basic")
 *   --component <name>   Screenshot all stories for a component (e.g., "Modal")
 *   --output <dir>       Output directory (default: .storybook/screenshots)
 *   --width <px>         Viewport width (default: 1280)
 *   --height <px>        Viewport height (default: 800)
 *   --build              Use built Storybook instead of dev server
 *   --url <url>          Custom Storybook URL (default: http://localhost:6006)
 *
 * Examples:
 *   # Screenshot all stories (requires Storybook to be running)
 *   bun scripts/screenshot-storybook.ts
 *
 *   # Screenshot specific component
 *   bun scripts/screenshot-storybook.ts --component Modal
 *
 *   # Screenshot specific story
 *   bun scripts/screenshot-storybook.ts --story modal--basic
 *
 *   # Use built Storybook
 *   bun scripts/screenshot-storybook.ts --build
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

interface ScreenshotOptions {
  story?: string;
  component?: string;
  output: string;
  width: number;
  height: number;
  build: boolean;
  url: string;
}

interface Story {
  id: string;
  title: string;
  name: string;
  kind: string;
}

function parseArgs(): ScreenshotOptions {
  const args = process.argv.slice(2);
  const options: ScreenshotOptions = {
    output: ".storybook/screenshots",
    width: 1280,
    height: 800,
    build: false,
    url: "http://localhost:6006",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--story":
        options.story = args[++i];
        break;
      case "--component":
        options.component = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--width":
        options.width = parseInt(args[++i]);
        break;
      case "--height":
        options.height = parseInt(args[++i]);
        break;
      case "--build":
        options.build = true;
        options.url = "file://" + join(process.cwd(), "storybook-static", "index.html");
        break;
      case "--url":
        options.url = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
Screenshot Storybook Stories

Usage: bun scripts/screenshot-storybook.ts [options]

Options:
  --story <name>       Screenshot a specific story (e.g., "modal--basic")
  --component <name>   Screenshot all stories for a component (e.g., "Modal")
  --output <dir>       Output directory (default: .storybook/screenshots)
  --width <px>         Viewport width (default: 1280)
  --height <px>        Viewport height (default: 800)
  --build              Use built Storybook instead of dev server
  --url <url>          Custom Storybook URL (default: http://localhost:6006)
        `);
        process.exit(0);
      default:
        if (args[i].startsWith("--")) {
          console.error(`Unknown option: ${args[i]}`);
          process.exit(1);
        }
    }
  }

  return options;
}

async function getStories(page: Page): Promise<Story[]> {
  // Wait for Storybook to load
  await page.waitForSelector("#storybook-preview-iframe", { timeout: 30000 });

  // Get stories from the Storybook API
  const stories = await page.evaluate(() => {
    // Access Storybook's internal API
    const frame = document.querySelector("#storybook-preview-iframe") as HTMLIFrameElement;
    if (!frame?.contentWindow) {
      throw new Error("Could not access Storybook preview frame");
    }

    // Try to get stories from the preview context
    const win = frame.contentWindow as any;
    if (win.__STORYBOOK_STORY_STORE__) {
      const store = win.__STORYBOOK_STORY_STORE__;
      const storyIds = store.extract ? Object.keys(store.extract()) : [];
      return storyIds.map((id: string) => {
        const [kind, name] = id.split("--");
        return {
          id,
          title: kind.replace(/-/g, "/"),
          name: name.replace(/-/g, " "),
          kind,
        };
      });
    }

    return [];
  });

  // If we couldn't get stories from the API, parse them from the sidebar
  if (!stories || stories.length === 0) {
    console.log("Falling back to sidebar parsing...");
    return await page.evaluate(() => {
      const stories: Story[] = [];
      const links = document.querySelectorAll("[data-item-id]");
      links.forEach((link) => {
        const id = link.getAttribute("data-item-id");
        if (id && id.includes("--")) {
          const [kind, name] = id.split("--");
          stories.push({
            id,
            title: kind.replace(/-/g, "/"),
            name: name.replace(/-/g, " "),
            kind,
          });
        }
      });
      return stories;
    });
  }

  return stories;
}

async function screenshotStory(
  page: Page,
  story: Story,
  outputDir: string,
  width: number,
  height: number,
  baseUrl: string
): Promise<void> {
  console.log(`📸 Screenshotting: ${story.title} / ${story.name}`);

  // Navigate to the story in the main Storybook UI (not iframe.html directly)
  const storyUrl = new URL(baseUrl);
  storyUrl.searchParams.set("path", `/story/${story.id}`);
  await page.goto(storyUrl.toString(), { waitUntil: "networkidle" });

  // Wait a bit for any animations to settle
  await page.waitForTimeout(500);

  // Determine output filename
  const filename = `${story.id}.png`;
  const filepath = join(outputDir, filename);

  // Ensure directory exists
  await mkdir(dirname(filepath), { recursive: true });

  // Take screenshot of the iframe content
  const frame = page.frameLocator("#storybook-preview-iframe");
  const body = frame.locator("body");

  await body.screenshot({
    path: filepath,
    animations: "disabled",
  });

  console.log(`   ✓ Saved to ${filepath}`);
}

async function main() {
  const options = parseArgs();

  console.log("🎨 Storybook Screenshot Generator");
  console.log("=================================\n");

  // Create output directory
  if (!existsSync(options.output)) {
    await mkdir(options.output, { recursive: true });
    console.log(`📁 Created output directory: ${options.output}\n`);
  }

  // If using built storybook, check it exists
  if (options.build && !existsSync("storybook-static")) {
    console.error("❌ Built Storybook not found. Run 'make storybook-build' first.");
    process.exit(1);
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Launch browser
    console.log("🌐 Launching browser...");
    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
    });

    // Navigate to Storybook
    console.log(`🔗 Connecting to Storybook at ${options.url}...`);
    await page.goto(options.url, { waitUntil: "networkidle", timeout: 30000 });

    // Get all stories
    console.log("📚 Loading stories...");
    const allStories = await getStories(page);
    console.log(`   Found ${allStories.length} stories\n`);

    if (allStories.length === 0) {
      console.error("❌ No stories found. Is Storybook running?");
      process.exit(1);
    }

    // Filter stories based on options
    let storiesToScreenshot = allStories;

    if (options.story) {
      storiesToScreenshot = allStories.filter((s) => s.id === options.story);
      if (storiesToScreenshot.length === 0) {
        console.error(`❌ Story not found: ${options.story}`);
        console.log("\nAvailable stories:");
        allStories.forEach((s) => console.log(`  - ${s.id}`));
        process.exit(1);
      }
    } else if (options.component) {
      const componentLower = options.component.toLowerCase();
      storiesToScreenshot = allStories.filter((s) => s.kind.toLowerCase().includes(componentLower));
      if (storiesToScreenshot.length === 0) {
        console.error(`❌ No stories found for component: ${options.component}`);
        console.log("\nAvailable components:");
        const components = new Set(allStories.map((s) => s.kind));
        components.forEach((c) => console.log(`  - ${c}`));
        process.exit(1);
      }
    }

    console.log(`📸 Taking ${storiesToScreenshot.length} screenshot(s)...\n`);

    // Screenshot each story
    for (const story of storiesToScreenshot) {
      await screenshotStory(
        page,
        story,
        options.output,
        options.width,
        options.height,
        options.url
      );
    }

    console.log("\n✨ Done! Screenshots saved to:", options.output);
    console.log("\nGenerated files:");
    storiesToScreenshot.forEach((s) => {
      console.log(`  - ${s.id}.png`);
    });
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  } finally {
    // Cleanup
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

main();
