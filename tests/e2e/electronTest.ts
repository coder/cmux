import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { _electron as electron, type ElectronApplication } from "playwright";
import { prepareDemoProject, type DemoProjectConfig } from "./utils/demoProject";
import { createWorkspaceUI, type WorkspaceUI } from "./utils/ui";

interface WorkspaceHarness {
  configRoot: string;
  demoProject: DemoProjectConfig;
}

interface ElectronFixtures {
  app: ElectronApplication;
  page: Page;
  workspace: WorkspaceHarness;
  ui: WorkspaceUI;
}

const appRoot = path.resolve(__dirname, "..", "..");
const defaultTestRoot = path.join(appRoot, "tests", "e2e", "tmp", "cmux-root");
const DEV_SERVER_PORT = 5173;

async function waitForServerReady(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

function sanitizeForPath(value: string): string {
  const compact = value
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase();
  return compact.length > 0 ? compact : `test-${Date.now()}`;
}

function shouldSkipBuild(): boolean {
  return process.env.CMUX_E2E_SKIP_BUILD === "1";
}

function buildTarget(target: string): void {
  if (shouldSkipBuild()) {
    return;
  }
  const result = spawnSync("make", [target], {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.status !== 0) {
    throw new Error(`Failed to build ${target} (exit ${result.status ?? "unknown"})`);
  }
}

export const electronTest = base.extend<ElectronFixtures>({
  workspace: async ({}, use, testInfo) => {
    const envRoot = process.env.CMUX_TEST_ROOT ?? "";
    const baseRoot = envRoot || defaultTestRoot;
    const testRoot = envRoot
      ? baseRoot
      : path.join(baseRoot, sanitizeForPath(testInfo.title ?? testInfo.testId));

    const shouldCleanup = !envRoot;

    await fsPromises.mkdir(path.dirname(testRoot), { recursive: true });
    await fsPromises.rm(testRoot, { recursive: true, force: true });
    await fsPromises.mkdir(testRoot, { recursive: true });

    const demoProject = prepareDemoProject(testRoot);
    const userDataDir = path.join(testRoot, "user-data");
    await fsPromises.rm(userDataDir, { recursive: true, force: true });

    await use({
      configRoot: testRoot,
      demoProject,
    });

    if (shouldCleanup) {
      await fsPromises.rm(testRoot, { recursive: true, force: true });
    }
  },
  app: async ({ workspace }, use, testInfo) => {
    const { configRoot } = workspace;
    buildTarget("build-main");
    buildTarget("build-preload");

    const devServer = spawn("make", ["dev"], {
      cwd: appRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        NODE_ENV: "development",
        VITE_DISABLE_MERMAID: "1",
      },
    });

    let devServerExited = false;
    const devServerExitPromise = new Promise<void>((resolve) => {
      const handleExit = () => {
        devServerExited = true;
        resolve();
      };

      if (devServer.exitCode !== null) {
        handleExit();
      } else {
        devServer.once("exit", handleExit);
      }
    });

    const stopDevServer = async () => {
      if (!devServerExited && devServer.exitCode === null) {
        devServer.kill("SIGTERM");
      }

      await devServerExitPromise;
    };

    let recordVideoDir = "";
    let electronApp: ElectronApplication | undefined;

    try {
      await waitForServerReady(`http://127.0.0.1:${DEV_SERVER_PORT}`);
      if (devServer.exitCode !== null) {
        throw new Error(`Vite dev server exited early (code ${devServer.exitCode})`);
      }

      recordVideoDir = testInfo.outputPath("electron-video");
      fs.mkdirSync(recordVideoDir, { recursive: true });

      const devHost = process.env.CMUX_DEVSERVER_HOST ?? "127.0.0.1";
      electronApp = await electron.launch({
        args: ["."],
        cwd: appRoot,
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
          CMUX_MOCK_AI: process.env.CMUX_MOCK_AI ?? "1",
          CMUX_TEST_ROOT: configRoot,
          CMUX_E2E: "1",
          CMUX_E2E_LOAD_DIST: "0",
          CMUX_DEVSERVER_PORT: String(DEV_SERVER_PORT),
          CMUX_DEVSERVER_HOST: devHost,
          VITE_DISABLE_MERMAID: "1",
        },
        recordVideo: {
          dir: recordVideoDir,
          size: { width: 1280, height: 720 },
        },
      });

      try {
        await use(electronApp);
      } finally {
        if (electronApp) {
          await electronApp.close();
        }

        if (recordVideoDir) {
          try {
            const videoFiles = await fsPromises.readdir(recordVideoDir);
            if (electronApp && videoFiles.length) {
              const videosDir = path.join(appRoot, "artifacts", "videos");
              await fsPromises.mkdir(videosDir, { recursive: true });
              const orderedFiles = [...videoFiles].sort();
              const baseName = testInfo.title.replace(/\s+/g, "-").toLowerCase();
              for (const [index, file] of orderedFiles.entries()) {
                const ext = path.extname(file) || ".webm";
                const suffix = orderedFiles.length > 1 ? `-${index}` : "";
                const destination = path.join(videosDir, `${baseName}${suffix}${ext}`);
                await fsPromises.rm(destination, { force: true });
                await fsPromises.rename(path.join(recordVideoDir, file), destination);
                console.log(`[video] saved to ${destination}`); // eslint-disable-line no-console
              }
            } else if (electronApp) {
              console.warn(
                `[video] no video captured for "${testInfo.title}" at ${recordVideoDir}`
              ); // eslint-disable-line no-console
            }
          } catch (error) {
            console.error(`[video] failed to process video for "${testInfo.title}":`, error); // eslint-disable-line no-console
          } finally {
            await fsPromises.rm(recordVideoDir, { recursive: true, force: true });
          }
        }
      }
    } finally {
      await stopDevServer();
    }
  },
  page: async ({ app }, use) => {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window.setViewportSize({ width: 1600, height: 900 });
    window.on("console", (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[renderer:${msg.type()}]`, msg.text());
    });
    window.on("pageerror", (error) => {
      console.error("[renderer:error]", error);
    });
    await use(window);
  },
  ui: async ({ page, workspace }, use) => {
    const helpers = createWorkspaceUI(page, workspace.demoProject);
    await use(helpers);
  },
});

export const electronExpect = expect;
