import * as fs from "fs";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import type { Config } from "@/config";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/types/notifications";

/**
 * PreferencesService - loads and saves user preferences under ~/.cmux
 *
 * Currently only manages desktop notification preferences. Designed so we can
 * add additional preference namespaces later without changing callers.
 */
export class PreferencesService {
  private readonly prefsFile: string;

  constructor(private readonly config: Config) {
    this.prefsFile = path.join(this.config.rootDir, "preferences.json");
  }

  /** Load preferences from disk, returning defaults if missing or invalid */
  load(): NotificationPreferences {
    try {
      if (fs.existsSync(this.prefsFile)) {
        const raw = fs.readFileSync(this.prefsFile, "utf-8");
        const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
        return PreferencesService.mergeWithDefaults(parsed);
      }
    } catch (error) {
      // Don't throw - fall back to defaults on parse or IO error
      console.warn("Failed to load preferences.json, using defaults:", error);
    }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  /** Persist preferences atomically */
  save(next: NotificationPreferences): void {
    try {
      const dir = path.dirname(this.prefsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const toWrite = PreferencesService.mergeWithDefaults(next);
      writeFileAtomic.sync(this.prefsFile, JSON.stringify(toWrite, null, 2));
    } catch (error) {
      console.error("Error saving preferences:", error);
    }
  }

  private static mergeWithDefaults(
    partial?: Partial<NotificationPreferences>
  ): NotificationPreferences {
    const base = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    if (!partial) return base;
    return {
      enabled: partial.enabled ?? base.enabled,
      kinds: {
        complete: partial.kinds?.complete ?? base.kinds.complete,
        question: partial.kinds?.question ?? base.kinds.question,
        error: partial.kinds?.error ?? base.kinds.error,
      },
      onlyWhenUnfocused: partial.onlyWhenUnfocused ?? base.onlyWhenUnfocused,
      includePreview: partial.includePreview ?? base.includePreview,
    };
  }
}

