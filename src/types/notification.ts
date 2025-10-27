/**
 * Notification types for completion notifications
 */

/**
 * Push notification subscription object
 * Standard Web Push API subscription format
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification payload sent to service worker
 */
export interface NotificationPayload {
  title: string;
  body: string;
  workspaceId: string;
}

/**
 * VAPID keys for web push authentication
 */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}
