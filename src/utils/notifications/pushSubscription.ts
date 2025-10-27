/**
 * Push subscription utilities for web/mobile notifications
 */

/**
 * Convert VAPID key from base64 to Uint8Array for subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to push notifications for a workspace
 * @param workspaceId - Workspace to subscribe to
 * @returns Success status and optional error message
 */
export async function subscribeToPush(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  // Check if browser supports notifications
  if (!("Notification" in window)) {
    return { success: false, error: "Notifications not supported" };
  }

  // Check if service worker is supported
  if (!("serviceWorker" in navigator)) {
    return { success: false, error: "Service workers not supported" };
  }

  // Request permission if not granted
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { success: false, error: "Notification permission denied" };
  }

  try {
    // Get VAPID key from backend
    const vapidKey = await window.api.notification.getVapidKey();
    if (!vapidKey) {
      return { success: false, error: "VAPID key not available" };
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    // Send subscription to backend
    await window.api.notification.subscribePush(workspaceId, subscription.toJSON());

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Unsubscribe from push notifications for a workspace
 */
export async function unsubscribeFromPush(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { success: false, error: "Service workers not supported" };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await window.api.notification.unsubscribePush(workspaceId, subscription.endpoint);
      await subscription.unsubscribe();
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
