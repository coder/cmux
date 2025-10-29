import { describe, it, expect } from "bun:test";
import { NotificationService } from "@/services/notificationService";
import type { CompletedMessagePart } from "@/types/stream";
import type { NotificationPreferences } from "@/types/notifications";

class MockPrefsService {
  constructor(private prefs: NotificationPreferences) {}
  load() { return this.prefs; }
  save() {}
}

class TestableNotificationService extends NotificationService {
  public shown: Array<{ title: string; body: string }> = [];
  protected createNotification(options: any) {
    const self = this;
    return {
      on: () => {},
      show: () => { self.shown.push({ title: options.title, body: options.body }); },
    } as any;
  }
}

describe("NotificationService helpers", () => {
  const parts: CompletedMessagePart[] = [
    { type: "text", text: "Here is some output.\n\n```ts\nconst x = 1;\n```\nAnd more." },
  ];

  it("builds a preview and strips code blocks", () => {
    const svc = new TestableNotificationService(() => null, new MockPrefsService({
      enabled: true,
      kinds: { complete: true, question: true, error: true },
      onlyWhenUnfocused: false,
      includePreview: true,
    }) as any);

    const preview = svc.buildPreviewFromParts(parts, 200);
    expect(preview).toContain("Here is some output.");
    expect(preview).not.toContain("const x = 1");
  });

  it("detects questions heuristically", () => {
    const svc = new TestableNotificationService(() => null, new MockPrefsService({
      enabled: true,
      kinds: { complete: true, question: true, error: true },
      onlyWhenUnfocused: false,
      includePreview: true,
    }) as any);

    expect(svc.isQuestion("What do you think? ")).toBe(true);
    expect(svc.isQuestion("Please run the tests.")).toBe(false);
  });
});

