import { expect, type Locator, type Page } from "@playwright/test";
import type { DemoProjectConfig } from "./demoProject";

type ChatMode = "Plan" | "Exec";

export interface StreamTimelineEvent {
  type: string;
  timestamp: number;
  delta?: string;
  messageId?: string;
  model?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
}

export interface StreamTimeline {
  events: StreamTimelineEvent[];
}

export interface WorkspaceUI {
  readonly projects: {
    openFirstWorkspace(): Promise<void>;
  };
  readonly chat: {
    waitForTranscript(): Promise<void>;
    setMode(mode: ChatMode): Promise<void>;
    setThinkingLevel(value: number): Promise<void>;
    sendMessage(message: string): Promise<void>;
    expectTranscriptContains(text: string): Promise<void>;
    expectActionButtonVisible(label: string): Promise<void>;
    clickActionButton(label: string): Promise<void>;
    expectStatusMessageContains(text: string): Promise<void>;
    captureStreamTimeline(
      action: () => Promise<void>,
      options?: { timeoutMs?: number }
    ): Promise<StreamTimeline>;
  };
  readonly metaSidebar: {
    expectVisible(): Promise<void>;
    selectTab(label: string): Promise<void>;
  };
  readonly context: DemoProjectConfig;
}

function sanitizeMode(mode: ChatMode): ChatMode {
  const normalized = mode.toLowerCase();
  switch (normalized) {
    case "plan":
      return "Plan";
    case "exec":
      return "Exec";
    default:
      throw new Error(`Unsupported chat mode: ${mode as string}`);
  }
}

function sliderLocator(page: Page): Locator {
  return page.getByRole("slider", { name: "Thinking:" });
}

function transcriptLocator(page: Page): Locator {
  return page.getByRole("log", { name: "Conversation transcript" });
}

export function createWorkspaceUI(page: Page, context: DemoProjectConfig): WorkspaceUI {
  const projects = {
    async openFirstWorkspace(): Promise<void> {
      const navigation = page.getByRole("navigation", { name: "Projects" });
      await expect(navigation).toBeVisible();

      const projectItems = navigation.locator('[role="button"][aria-controls]');
      const projectItem = projectItems.first();
      await expect(projectItem).toBeVisible();

      const workspaceListId = await projectItem.getAttribute("aria-controls");
      if (!workspaceListId) {
        throw new Error("Project item is missing aria-controls attribute");
      }

      const workspaceItems = page.locator(`#${workspaceListId} > div[role="button"]`);
      const workspaceItem = workspaceItems.first();
      const isVisible = await workspaceItem.isVisible().catch(() => false);
      if (!isVisible) {
        await projectItem.click();
        await workspaceItem.waitFor({ state: "visible" });
      }

      await workspaceItem.click();
      await chat.waitForTranscript();
    },
  };

  const chat = {
    async waitForTranscript(): Promise<void> {
      await transcriptLocator(page).waitFor();
    },

    async setMode(mode: ChatMode): Promise<void> {
      const normalizedMode = sanitizeMode(mode);
      const button = page.getByRole("button", { name: normalizedMode, exact: true });
      await expect(button).toBeVisible();
      await button.click();
      const pressed = await button.getAttribute("aria-pressed");
      if (pressed !== "true") {
        throw new Error(`"${normalizedMode}" button did not toggle into active state`);
      }
    },

    async setThinkingLevel(value: number): Promise<void> {
      if (!Number.isInteger(value)) {
        throw new Error("Slider value must be an integer");
      }
      if (value < 0 || value > 10) {
        throw new Error(`Slider value ${value} is outside expected range 0-10`);
      }

      const slider = sliderLocator(page);
      await expect(slider).toBeVisible();
      await slider.evaluate((element, desiredValue) => {
        const input = element as HTMLInputElement;
        input.value = String(desiredValue);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);

      await expect(slider).toHaveValue(String(value));
    },

    async sendMessage(message: string): Promise<void> {
      if (message.length === 0) {
        throw new Error("Message must not be empty");
      }
      const input = page.getByRole("textbox", {
        name: /Message Claude|Edit your last message/,
      });
      await expect(input).toBeVisible();
      await input.fill(message);
      await page.keyboard.press("Enter");
    },

    async expectTranscriptContains(text: string): Promise<void> {
      await expect(transcriptLocator(page)).toContainText(text, { timeout: 45_000 });
    },

    async expectActionButtonVisible(label: string): Promise<void> {
      const button = page.getByRole("button", { name: label });
      await expect(button.last()).toBeVisible();
    },

    async clickActionButton(label: string): Promise<void> {
      const button = page.getByRole("button", { name: label });
      const lastButton = button.last();
      await expect(lastButton).toBeVisible();
      await lastButton.click();
    },

    async expectStatusMessageContains(text: string): Promise<void> {
      const status = page.getByRole("status").filter({ hasText: text });
      await expect(status).toBeVisible();
    },

    async captureStreamTimeline(
      action: () => Promise<void>,
      options?: { timeoutMs?: number }
    ): Promise<StreamTimeline> {
      const timeoutMs = options?.timeoutMs ?? 12_000;
      const workspaceId = context.workspaceId;
      await page.evaluate((id: string) => {
        type StreamCaptureEvent = {
          type: string;
          timestamp: number;
          delta?: string;
          messageId?: string;
          model?: string;
          toolName?: string;
          toolCallId?: string;
          args?: unknown;
          result?: unknown;
        };
        type StreamCapture = {
          events: StreamCaptureEvent[];
          unsubscribe: () => void;
        };

        const win = window as unknown as {
          api: typeof window.api;
          __cmuxStreamCapture?: Record<string, StreamCapture>;
        };

        const store =
          win.__cmuxStreamCapture ??
          (win.__cmuxStreamCapture = Object.create(null) as Record<string, StreamCapture>);
        const existing = store[id];
        if (existing) {
          existing.unsubscribe();
          delete store[id];
        }

        const events: StreamCaptureEvent[] = [];
        const unsubscribe = win.api.workspace.onChat(id, (message) => {
          if (!message || typeof message !== "object") {
            return;
          }
          if (!("type" in message) || typeof (message as { type?: unknown }).type !== "string") {
            return;
          }
          const eventType = (message as { type: string }).type;
          const isStreamEvent = eventType.startsWith("stream-");
          const isToolEvent = eventType.startsWith("tool-call-");
          const isReasoningEvent = eventType.startsWith("reasoning-");
          if (!isStreamEvent && !isToolEvent && !isReasoningEvent) {
            return;
          }
          const entry: StreamCaptureEvent = {
            type: eventType,
            timestamp: Date.now(),
          };
          if ("delta" in message && typeof (message as { delta?: unknown }).delta === "string") {
            entry.delta = (message as { delta: string }).delta;
          }
          if (
            "messageId" in message &&
            typeof (message as { messageId?: unknown }).messageId === "string"
          ) {
            entry.messageId = (message as { messageId: string }).messageId;
          }
          if ("model" in message && typeof (message as { model?: unknown }).model === "string") {
            entry.model = (message as { model: string }).model;
          }
          if (
            isToolEvent &&
            "toolName" in message &&
            typeof (message as { toolName?: unknown }).toolName === "string"
          ) {
            entry.toolName = (message as { toolName: string }).toolName;
          }
          if (
            isToolEvent &&
            "toolCallId" in message &&
            typeof (message as { toolCallId?: unknown }).toolCallId === "string"
          ) {
            entry.toolCallId = (message as { toolCallId: string }).toolCallId;
          }
          if (isToolEvent && "args" in message) {
            entry.args = (message as { args?: unknown }).args;
          }
          if (isToolEvent && "result" in message) {
            entry.result = (message as { result?: unknown }).result;
          }
          events.push(entry);
        });

        store[id] = { events, unsubscribe };
      }, workspaceId);

      let actionError: unknown;
      try {
        await action();
        await page.waitForFunction(
          (id: string) => {
            type StreamCaptureEvent = { type: string };
            type StreamCapture = { events: StreamCaptureEvent[] };
            const win = window as unknown as {
              __cmuxStreamCapture?: Record<string, StreamCapture>;
            };
            const capture = win.__cmuxStreamCapture?.[id];
            if (!capture) {
              return false;
            }
            return capture.events.some((event) => event.type === "stream-end");
          },
          workspaceId,
          { timeout: timeoutMs }
        );
      } catch (error) {
        actionError = error;
      }

      const events = await page.evaluate((id: string) => {
        type StreamCaptureEvent = {
          type: string;
          timestamp: number;
          delta?: string;
          messageId?: string;
          model?: string;
          toolName?: string;
          toolCallId?: string;
          args?: unknown;
          result?: unknown;
        };
        type StreamCapture = {
          events: StreamCaptureEvent[];
          unsubscribe: () => void;
        };
        const win = window as unknown as {
          __cmuxStreamCapture?: Record<string, StreamCapture>;
        };
        const store = win.__cmuxStreamCapture;
        const capture = store?.[id];
        if (!capture) {
          return [] as StreamCaptureEvent[];
        }
        capture.unsubscribe();
        if (store) {
          delete store[id];
        }
        return capture.events.slice();
      }, workspaceId);

      if (actionError) {
        throw actionError;
      }

      return { events };
    },
  };

  const metaSidebar = {
    async expectVisible(): Promise<void> {
      await expect(page.getByRole("complementary", { name: "Workspace insights" })).toBeVisible();
    },

    async selectTab(label: string): Promise<void> {
      const tab = page.getByRole("tab", { name: label });
      await expect(tab).toBeVisible();
      await tab.click();
      const selected = await tab.getAttribute("aria-selected");
      if (selected !== "true") {
        throw new Error(`Tab "${label}" did not enter selected state`);
      }
    },
  };

  return {
    projects,
    chat,
    metaSidebar,
    context,
  };
}
