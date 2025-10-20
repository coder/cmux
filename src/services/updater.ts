import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@/constants/ipc-constants";
import { log } from "./log";

export type UpdateStatus =
  | { type: "checking" }
  | { type: "available"; info: UpdateInfo }
  | { type: "not-available" }
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
  private updateStatus: UpdateStatus = { type: "not-available" };
  private checkTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Wait for user confirmation
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
      log.info("Checking for updates...");
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
      log.info("No updates available");
      this.clearCheckTimeout();
      this.updateStatus = { type: "not-available" };
      this.notifyRenderer();
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      log.info(`Download progress: ${percent}%`);
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
    log.info("setMainWindow() called");
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
  async checkForUpdates(): Promise<void> {
    log.info("checkForUpdates() called");
    try {
      // Clear any existing timeout
      this.clearCheckTimeout();
      
      // Set checking status immediately
      log.info("Setting status to 'checking'");
      this.updateStatus = { type: "checking" };
      this.notifyRenderer();
      
      // Set timeout to prevent hanging in "checking" state
      log.info("Setting 30s timeout");
      this.checkTimeout = setTimeout(() => {
        if (this.updateStatus.type === "checking") {
          log.info("Update check timed out after 30s, setting to 'not-available'");
          this.updateStatus = { type: "not-available" };
          this.notifyRenderer();
        } else {
          log.info(`Timeout fired but status already changed to: ${this.updateStatus.type}`);
        }
      }, 30000); // 30 seconds
      
      // Trigger the check (don't await - it never resolves, just fires events)
      log.info("Calling autoUpdater.checkForUpdates()");
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
    await autoUpdater.downloadUpdate();
  }

  /**
   * Install a downloaded update and restart the app
   */
  installUpdate(): void {
    if (this.updateStatus.type !== "downloaded") {
      throw new Error("No update downloaded to install");
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
    log.info("notifyRenderer() called, status:", this.updateStatus);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      log.info("Sending status to renderer via IPC");
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, this.updateStatus);
    } else {
      log.info("Cannot send - mainWindow is null or destroyed");
    }
  }
}
