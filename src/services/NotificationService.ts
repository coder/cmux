import * as fs from "fs";
import * as path from "path";
import webpush from "web-push";
import type { PushSubscription, VapidKeys, NotificationPayload } from "../types/notification.js";
import { log } from "./log.js";

/**
 * NotificationService manages completion notifications for both desktop and web/mobile.
 * - Desktop: Shows Electron Notification
 * - Web/Mobile: Sends web push notifications to subscribed clients
 */
export class NotificationService {
  private readonly isDesktop: boolean;
  private vapidKeys: VapidKeys | null = null;
  private subscriptions = new Map<string, PushSubscription[]>(); // workspaceId -> subscriptions
  private readonly vapidKeysPath: string;

  constructor(configDir: string, isDesktop: boolean) {
    this.isDesktop = isDesktop;
    this.vapidKeysPath = path.join(configDir, "vapid.json");

    // Load or generate VAPID keys for web push
    if (!isDesktop) {
      this.initializeVapidKeys();
    }
  }

  /**
   * Initialize VAPID keys for web push authentication
   * Generates new keys if they don't exist, otherwise loads from disk
   * Note: Uses sync fs methods during startup initialization (before async operations start)
   */
  private initializeVapidKeys(): void {
    try {
      // eslint-disable-next-line local/no-sync-fs-methods -- Startup initialization needs sync
      if (fs.existsSync(this.vapidKeysPath)) {
        // eslint-disable-next-line local/no-sync-fs-methods -- Startup initialization needs sync
        const keysJson = fs.readFileSync(this.vapidKeysPath, "utf-8");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON parse is safe for VAPID keys
        this.vapidKeys = JSON.parse(keysJson);
        log.info("Loaded existing VAPID keys");
      } else {
        const keys = webpush.generateVAPIDKeys();
        this.vapidKeys = {
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
        };
        // eslint-disable-next-line local/no-sync-fs-methods -- Startup initialization needs sync
        fs.writeFileSync(this.vapidKeysPath, JSON.stringify(this.vapidKeys, null, 2));
        log.info("Generated and saved new VAPID keys");
      }

      // Configure web-push with VAPID details
      if (this.vapidKeys) {
        webpush.setVapidDetails(
          "mailto:support@cmux.io",
          this.vapidKeys.publicKey,
          this.vapidKeys.privateKey
        );
      }
    } catch (error) {
      log.error("Failed to initialize VAPID keys:", error);
    }
  }

  /**
   * Get the public VAPID key for client-side subscription
   */
  getVapidPublicKey(): string | null {
    return this.vapidKeys?.publicKey ?? null;
  }

  /**
   * Subscribe a client to push notifications
   */
  subscribePush(workspaceId: string, subscription: PushSubscription): void {
    const existing = this.subscriptions.get(workspaceId) ?? [];

    // Check if subscription already exists (by endpoint)
    const isDuplicate = existing.some((sub) => sub.endpoint === subscription.endpoint);
    if (isDuplicate) {
      log.debug(`Subscription already exists for workspace ${workspaceId}`);
      return;
    }

    existing.push(subscription);
    this.subscriptions.set(workspaceId, existing);
    log.info(`Added push subscription for workspace ${workspaceId}`);
  }

  /**
   * Unsubscribe a client from push notifications
   */
  unsubscribePush(workspaceId: string, endpoint: string): void {
    const existing = this.subscriptions.get(workspaceId) ?? [];
    const filtered = existing.filter((sub) => sub.endpoint !== endpoint);

    if (filtered.length < existing.length) {
      this.subscriptions.set(workspaceId, filtered);
      log.info(`Removed push subscription for workspace ${workspaceId}`);
    }
  }

  /**
   * Send a completion notification
   * Desktop: Shows Electron notification (handled by caller)
   * Web/Mobile: Sends push notification to all subscribed clients
   */
  async sendCompletionNotification(workspaceId: string, workspaceName: string): Promise<void> {
    if (this.isDesktop) {
      // Desktop notifications are handled by the caller (main-desktop.ts)
      // This method is only called for web/mobile push notifications
      return;
    }

    const subscriptions = this.subscriptions.get(workspaceId) ?? [];
    if (subscriptions.length === 0) {
      log.debug(`No push subscriptions for workspace ${workspaceId}`);
      return;
    }

    const payload: NotificationPayload = {
      title: "Completion",
      body: `${workspaceName} has finished`,
      workspaceId,
    };

    const payloadString = JSON.stringify(payload);

    // Send to all subscriptions, removing invalid ones
    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payloadString);
        log.debug(`Sent push notification for workspace ${workspaceId}`);
        return { success: true, subscription };
      } catch (error) {
        log.error(`Failed to send push notification, removing subscription:`, error);
        return { success: false, subscription };
      }
    });

    const results = await Promise.allSettled(sendPromises);

    // Remove failed subscriptions
    const validSubscriptions = results
      .filter((result) => {
        if (result.status === "fulfilled" && result.value.success) {
          return true;
        }
        return false;
      })
      .map((_result, index) => subscriptions[index]);

    this.subscriptions.set(workspaceId, validSubscriptions);
  }
}
