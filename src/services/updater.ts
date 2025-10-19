import { autoUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";
import type { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@/constants/ipc-constants";

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

  constructor() {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Wait for user confirmation
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for updates...");
      this.updateStatus = { type: "checking" };
      this.notifyRenderer();
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      console.log("Update available:", info.version);
      this.updateStatus = { type: "available", info };
      this.notifyRenderer();
    });

    autoUpdater.on("update-not-available", () => {
      console.log("No updates available");
      this.updateStatus = { type: "not-available" };
      this.notifyRenderer();
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`Download progress: ${percent}%`);
      this.updateStatus = { type: "downloading", percent };
      this.notifyRenderer();
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      console.log("Update downloaded:", info.version);
      this.updateStatus = { type: "downloaded", info };
      this.notifyRenderer();
    });

    autoUpdater.on("error", (error) => {
      console.error("Update error:", error);
      this.updateStatus = { type: "error", message: error.message };
      this.notifyRenderer();
    });
  }

  /**
   * Set the main window for sending status updates
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    // Send current status to newly connected window
    this.notifyRenderer();
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates(): Promise<UpdateStatus> {
    try {
      await autoUpdater.checkForUpdates();
      return this.updateStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.updateStatus = { type: "error", message };
      this.notifyRenderer();
      return this.updateStatus;
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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, this.updateStatus);
    }
  }
}
