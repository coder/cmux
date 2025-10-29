import type { BrowserWindow, NotificationConstructorOptions } from "electron";
// IMPORTANT: Avoid importing electron Notification at module scope.
// In tests (non-Electron), requiring 'electron' would throw.
// We'll require it lazily in createNotification().
import type { CompletedMessagePart } from "@/types/stream";
import type { NotificationPreferences, NotificationKind } from "@/types/notifications";
import { PreferencesService } from "@/services/preferencesService";

/**
 * NotificationService - desktop-native notifications gated by user preferences
 *
 * Platform support:
 * - macOS: Notification Center
 * - Windows: Action Center (requires AUMID set by app.setAppUserModelId)
 * - Linux: a notification daemon must be running
 */
export class NotificationService {
  constructor(
    private readonly mainWindowProvider: () => BrowserWindow | null,
    private readonly prefsService: PreferencesService
  ) {}

  // Public helpers for consumers
  notifyComplete(parts: CompletedMessagePart[]): void {
    const prefs = this.prefsService.load();
    if (!this.shouldNotify(prefs, "complete")) return;

    const preview = prefs.includePreview ? this.buildPreviewFromParts(parts) : undefined;
    const body = preview ? preview : "Assistant response completed";

    this.notify("Assistant completed", body);
  }

  notifyQuestion(parts: CompletedMessagePart[]): void {
    const prefs = this.prefsService.load();
    if (!this.shouldNotify(prefs, "question")) return;

    const preview = prefs.includePreview ? this.buildPreviewFromParts(parts) : undefined;
    const body = preview ? preview : "Assistant asked a question";

    this.notify("Assistant has a question", body);
  }

  notifyError(errorType: string | undefined, message: string): void {
    const prefs = this.prefsService.load();
    if (!this.shouldNotify(prefs, "error")) return;

    const body = message || "An error occurred during streaming";
    const title = errorType ? `Stream error: ${errorType}` : "Stream error";
    this.notify(title, body);
  }

  // Core notify method with gating
  private notify(title: string, body: string): void {
    const prefs = this.prefsService.load();
    if (!prefs.enabled) return;

    const win = this.mainWindowProvider();
    if (prefs.onlyWhenUnfocused && win?.isFocused()) return;

    const options: NotificationConstructorOptions = {
      title: title,
      body: body,
      silent: false,
    };

    const notification = this.createNotification(options);
    // Guard against test overrides that don't implement on()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (notification as any).on?.("click", () => {
      const w = this.mainWindowProvider();
      if (!w) return;
      if (w.isMinimized()) w.restore();
      // show() ensures window comes to front on all platforms
      w.show();
      w.focus();
    });
    notification.show();
  }

  // Build a short preview string from message parts
  buildPreviewFromParts(parts: CompletedMessagePart[], max = 180): string | undefined {
    if (!parts || parts.length === 0) return undefined;

    // Concatenate text parts only; ignore tools/images
    const text = parts
      .filter((p) => p && typeof p === "object" && "type" in p && p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join(" ");

    const normalized = text
      .replace(/```[\s\S]*?```/g, " ") // remove code blocks
      .replace(/\s+/g, " ") // collapse whitespace
      .trim();

    if (!normalized) return undefined;

    return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
  }

  // Simple heuristic to detect if preview ends with a question
  isQuestion(text: string | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.endsWith("?")) return true;

    // Also consider interrogatives within the last sentence
    const lastSentence = trimmed.split(/[.!?]/).pop() ?? trimmed;
    const lower = lastSentence.toLowerCase();
    return /\b(what|how|why|should|could|would|do you|can you|is it|are you)\b/.test(lower);
  }

  private shouldNotify(prefs: NotificationPreferences, kind: NotificationKind): boolean {
    if (!prefs.enabled) return false;
    if (kind === "complete" && !prefs.kinds.complete) return false;
    if (kind === "question" && !prefs.kinds.question) return false;
    if (kind === "error" && !prefs.kinds.error) return false;

    const win = this.mainWindowProvider();
    if (prefs.onlyWhenUnfocused && win?.isFocused()) return false;

    return true;
  }

  // Factory method for Notification (overridable in tests)
  // eslint-disable-next-line class-methods-use-this
  protected createNotification(options: NotificationConstructorOptions) {
    // Lazy require to avoid loading 'electron' in non-Electron environments (tests)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Notification } = require("electron") as typeof import("electron");
    return new Notification(options);
  }
}

