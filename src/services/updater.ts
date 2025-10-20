import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@/constants/ipc-constants";
import { log } from "./log";
import { parseDebugUpdater } from "@/utils/env";

// Update check timeout in milliseconds (30 seconds)
const UPDATE_CHECK_TIMEOUT_MS = 30_000;

// Backend UpdateStatus type (uses full UpdateInfo from electron-updater)
export type UpdateStatus =
  | { type: "idle" } // Initial state, no check performed yet
  | { type: "checking" }
  | { type: "available"; info: UpdateInfo }
  | { type: "up-to-date" } // Explicitly checked, no updates available
  | { type: "downloading"; percent: number }
  | { type: "downloaded"; info: UpdateInfo }
  | { type: "error"; message: string };

/**
 * Manages application updates using electron-updater.
 *
 * This service integrates with Electron's auto-updater to:
 * - Check for updates automatically and on-demand
 * - Download updates in the background
 * - Notify the renderer process of update status changes
 * - Install updates when requested by the user
 */
export class UpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateStatus: UpdateStatus = { type: "idle" };
  private checkTimeout: NodeJS.Timeout | null = null;
  private readonly fakeVersion: string | undefined;

  constructor() {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Wait for user confirmation
    autoUpdater.autoInstallOnAppQuit = true;

    // Parse DEBUG_UPDATER for dev mode and optional fake version
    const debugConfig = parseDebugUpdater(process.env.DEBUG_UPDATER);
    this.fakeVersion = debugConfig.fakeVersion;

    if (debugConfig.enabled) {
      log.debug("Forcing dev update config (DEBUG_UPDATER is set)");
      autoUpdater.forceDevUpdateConfig = true;

      if (this.fakeVersion) {
        log.debug(`DEBUG_UPDATER fake version enabled: ${this.fakeVersion}`);
      }
    }

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
      log.debug("Checking for updates...");
      this.updateStatus = { type: "checking" };
      this.notifyRenderer();
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      log.info("Update available:", info.version);
      this.clearCheckTimeout();
      this.updateStatus = { type: "available", info };
      this.notifyRenderer();
    });

    autoUpdater.on("update-not-available", () => {
      log.debug("No updates available - up to date");
      this.clearCheckTimeout();
      this.updateStatus = { type: "up-to-date" };
      this.notifyRenderer();
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      log.debug(`Download progress: ${percent}%`);
      this.updateStatus = { type: "downloading", percent };
      this.notifyRenderer();
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      log.info("Update downloaded:", info.version);
      this.updateStatus = { type: "downloaded", info };
      this.notifyRenderer();
    });

    autoUpdater.on("error", (error) => {
      log.error("Update error:", error);
      this.clearCheckTimeout();
      this.updateStatus = { type: "error", message: error.message };
      this.notifyRenderer();
    });
  }

  /**
   * Clear the check timeout
   */
  private clearCheckTimeout() {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
  }

  /**
   * Set the main window for sending status updates
   */
  setMainWindow(window: BrowserWindow) {
    log.debug("setMainWindow() called");
    this.mainWindow = window;
    // Send current status to newly connected window
    this.notifyRenderer();
  }

  /**
   * Check for updates manually
   *
   * This triggers the check but returns immediately. The actual results
   * will be delivered via event handlers (checking-for-update, update-available, etc.)
   *
   * A 30-second timeout ensures we don't stay in "checking" state indefinitely.
   */
  checkForUpdates(): void {
    log.debug("checkForUpdates() called");
    try {
      // Clear any existing timeout
      this.clearCheckTimeout();

      // Set checking status immediately
      log.debug("Setting status to 'checking'");
      this.updateStatus = { type: "checking" };
      this.notifyRenderer();

      // If fake version is set, immediately report it as available
      if (this.fakeVersion) {
        log.debug(`Faking update available: ${this.fakeVersion}`);
        const version = this.fakeVersion;
        setTimeout(() => {
          const fakeInfo = {
            version,
          } satisfies Partial<UpdateInfo> as UpdateInfo;
          this.updateStatus = {
            type: "available",
            info: fakeInfo,
          };
          this.notifyRenderer();
        }, 500); // Small delay to simulate check
        return;
      }

      // Set timeout to prevent hanging in "checking" state
      log.debug(`Setting ${UPDATE_CHECK_TIMEOUT_MS}ms timeout`);
      this.checkTimeout = setTimeout(() => {
        if (this.updateStatus.type === "checking") {
          log.debug(
            `Update check timed out after ${UPDATE_CHECK_TIMEOUT_MS}ms, returning to idle state`
          );
          this.updateStatus = { type: "idle" };
          this.notifyRenderer();
        } else {
          log.debug(`Timeout fired but status already changed to: ${this.updateStatus.type}`);
        }
      }, UPDATE_CHECK_TIMEOUT_MS);

      // Trigger the check (don't await - it never resolves, just fires events)
      log.debug("Calling autoUpdater.checkForUpdates()");
      autoUpdater.checkForUpdates().catch((error) => {
        this.clearCheckTimeout();
        const message = error instanceof Error ? error.message : "Unknown error";
        log.error("Update check failed:", message);
        this.updateStatus = { type: "error", message };
        this.notifyRenderer();
      });
    } catch (error) {
      this.clearCheckTimeout();
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("Update check error:", message);
      this.updateStatus = { type: "error", message };
      this.notifyRenderer();
    }
  }

  /**
   * Download an available update
   */
  async downloadUpdate(): Promise<void> {
    if (this.updateStatus.type !== "available") {
      throw new Error("No update available to download");
    }

    // If using fake version, simulate download progress
    if (this.fakeVersion) {
      log.debug(`Faking download for version ${this.fakeVersion}`);
      this.updateStatus = { type: "downloading", percent: 0 };
      this.notifyRenderer();

      // Simulate download progress
      for (let percent = 0; percent <= 100; percent += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        this.updateStatus = { type: "downloading", percent };
        this.notifyRenderer();
      }

      // Mark as downloaded
      const version = this.fakeVersion;
      const fakeDownloadedInfo = { version } satisfies Partial<UpdateInfo> as UpdateInfo;
      this.updateStatus = {
        type: "downloaded",
        info: fakeDownloadedInfo,
      };
      this.notifyRenderer();
      return;
    }

    await autoUpdater.downloadUpdate();
  }

  /**
   * Install a downloaded update and restart the app
   */
  installUpdate(): void {
    if (this.updateStatus.type !== "downloaded") {
      throw new Error("No update downloaded to install");
    }

    // If using fake version, just log (can't actually restart with fake update)
    if (this.fakeVersion) {
      log.debug(`Fake update install requested for ${this.fakeVersion} - would restart app here`);
      return;
    }

    autoUpdater.quitAndInstall();
  }

  /**
   * Get the current update status
   */
  getStatus(): UpdateStatus {
    return this.updateStatus;
  }

  /**
   * Notify the renderer process of status changes
   */
  private notifyRenderer() {
    log.debug("notifyRenderer() called, status:", this.updateStatus);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      log.debug("Sending status to renderer via IPC");
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, this.updateStatus);
    } else {
      log.debug("Cannot send - mainWindow is null or destroyed");
    }
  }
}
