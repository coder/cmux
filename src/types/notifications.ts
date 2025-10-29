// Desktop notification types and preferences
// Keep small and serializable; persisted under ~/.cmux/preferences.json

export type NotificationKind = "complete" | "question" | "error";

export interface NotificationPreferences {
  enabled: boolean;
  kinds: {
    complete: boolean;
    question: boolean;
    error: boolean;
  };
  // If true, only show notifications when the app window is not focused
  onlyWhenUnfocused: boolean;
  // If true, include a short preview of assistant text when available
  includePreview: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  kinds: { complete: true, question: true, error: true },
  onlyWhenUnfocused: true,
  includePreview: true,
};

