import type { CmuxMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { HistoryService } from "@/services/historyService";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import type { SendMessageError } from "@/types/errors";
import type { AIService } from "@/services/aiService";
import type {
  MockAssistantEvent,
  MockStreamErrorEvent,
  MockStreamStartEvent,
  ScenarioTurn,
} from "./scenarioTypes";
import { allScenarios } from "./scenarios";
import type { StreamStartEvent, StreamDeltaEvent, StreamEndEvent } from "@/types/stream";
import type { ToolCallStartEvent, ToolCallEndEvent } from "@/types/stream";
import type { ReasoningDeltaEvent } from "@/types/stream";
import { getTokenizerForModel } from "@/utils/main/tokenizer";

interface MockPlayerDeps {
  aiService: AIService;
  historyService: HistoryService;
}

interface ActiveStream {
  timers: NodeJS.Timeout[];
  messageId: string;
}

export class MockScenarioPlayer {
  private readonly scenarios: ScenarioTurn[] = allScenarios;
  private readonly activeStreams = new Map<string, ActiveStream>();
  private readonly completedTurns = new Set<number>();

  constructor(private readonly deps: MockPlayerDeps) {}

  isStreaming(workspaceId: string): boolean {
    return this.activeStreams.has(workspaceId);
  }

  stop(workspaceId: string): void {
    const active = this.activeStreams.get(workspaceId);
    if (!active) return;

    // Clear all pending timers
    for (const timer of active.timers) {
      clearTimeout(timer);
    }

    // Emit stream-abort event to mirror real streaming behavior
    this.deps.aiService.emit("stream-abort", {
      type: "stream-abort",
      workspaceId,
      messageId: active.messageId,
      reason: "user_cancelled",
    });

    this.activeStreams.delete(workspaceId);
  }

  async play(
    messages: CmuxMessage[],
    workspaceId: string
  ): Promise<Result<void, SendMessageError>> {
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== "user") {
      return Err({ type: "unknown", raw: "Mock scenario expected a user message" });
    }

    const latestText = this.extractText(latest);
    const turnIndex = this.findTurnIndex(latestText);
    if (turnIndex === -1) {
      return Err({
        type: "unknown",
        raw: `Mock scenario turn mismatch. No scripted response for "${latestText}"`,
      });
    }

    const turn = this.scenarios[turnIndex];
    if (
      typeof turn.user.editOfTurn === "number" &&
      !this.completedTurns.has(turn.user.editOfTurn)
    ) {
      return Err({
        type: "unknown",
        raw: `Mock scenario turn "${turn.user.text}" requires completion of turn index ${turn.user.editOfTurn}`,
      });
    }

    const streamStart = turn.assistant.events.find(
      (event): event is MockStreamStartEvent => event.kind === "stream-start"
    );
    if (!streamStart) {
      return Err({ type: "unknown", raw: "Mock scenario turn missing stream-start" });
    }

    let historySequence = this.computeNextHistorySequence(messages);

    const assistantMessage = createCmuxMessage(turn.assistant.messageId, "assistant", "", {
      timestamp: Date.now(),
      model: streamStart.model,
    });

    const appendResult = await this.deps.historyService.appendToHistory(
      workspaceId,
      assistantMessage
    );
    if (!appendResult.success) {
      return Err({ type: "unknown", raw: appendResult.error });
    }
    historySequence = assistantMessage.metadata?.historySequence ?? historySequence;

    // Cancel any existing stream before starting a new one
    if (this.isStreaming(workspaceId)) {
      this.stop(workspaceId);
    }

    this.scheduleEvents(workspaceId, turn, historySequence);
    this.completedTurns.add(turnIndex);
    return Ok(undefined);
  }

  replayStream(_workspaceId: string): void {
    // No-op for mock scenario; events are deterministic and do not support mid-stream replay
  }

  private scheduleEvents(workspaceId: string, turn: ScenarioTurn, historySequence: number): void {
    const timers: NodeJS.Timeout[] = [];
    this.activeStreams.set(workspaceId, {
      timers,
      messageId: turn.assistant.messageId,
    });

    for (const event of turn.assistant.events) {
      const timer = setTimeout(() => {
        void this.dispatchEvent(workspaceId, event, turn.assistant.messageId, historySequence);
      }, event.delay);
      timers.push(timer);
    }
  }

  private async dispatchEvent(
    workspaceId: string,
    event: MockAssistantEvent,
    messageId: string,
    historySequence: number
  ): Promise<void> {
    switch (event.kind) {
      case "stream-start": {
        const payload: StreamStartEvent = {
          type: "stream-start",
          workspaceId,
          messageId,
          model: event.model,
          historySequence,
        };
        this.deps.aiService.emit("stream-start", payload);
        break;
      }
      case "reasoning-delta": {
        // Mock scenarios use the same tokenization logic as real streams for consistency
        const tokenizer = getTokenizerForModel("gpt-4"); // Mock uses GPT-4 tokenizer
        const tokens = tokenizer.countTokens(event.text);
        const payload: ReasoningDeltaEvent = {
          type: "reasoning-delta",
          workspaceId,
          messageId,
          delta: event.text,
          tokens,
          timestamp: Date.now(),
        };
        this.deps.aiService.emit("reasoning-delta", payload);
        break;
      }
      case "tool-start": {
        // Mock scenarios use the same tokenization logic as real streams for consistency
        const inputText = JSON.stringify(event.args);
        const tokenizer = getTokenizerForModel("gpt-4"); // Mock uses GPT-4 tokenizer
        const tokens = tokenizer.countTokens(inputText);
        const payload: ToolCallStartEvent = {
          type: "tool-call-start",
          workspaceId,
          messageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          tokens,
          timestamp: Date.now(),
        };
        this.deps.aiService.emit("tool-call-start", payload);
        break;
      }
      case "tool-end": {
        const payload: ToolCallEndEvent = {
          type: "tool-call-end",
          workspaceId,
          messageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
        };
        this.deps.aiService.emit("tool-call-end", payload);
        break;
      }
      case "stream-delta": {
        // Mock scenarios use the same tokenization logic as real streams for consistency
        const tokenizer = getTokenizerForModel("gpt-4"); // Mock uses GPT-4 tokenizer
        const tokens = tokenizer.countTokens(event.text);
        const payload: StreamDeltaEvent = {
          type: "stream-delta",
          workspaceId,
          messageId,
          delta: event.text,
          tokens,
          timestamp: Date.now(),
        };
        this.deps.aiService.emit("stream-delta", payload);
        break;
      }
      case "stream-error": {
        const payload: MockStreamErrorEvent = event;
        this.deps.aiService.emit("error", {
          type: "error",
          workspaceId,
          messageId,
          error: payload.error,
          errorType: payload.errorType,
        });
        this.cleanup(workspaceId);
        break;
      }
      case "stream-end": {
        const payload: StreamEndEvent = {
          type: "stream-end",
          workspaceId,
          messageId,
          metadata: {
            model: event.metadata.model,
            systemMessageTokens: event.metadata.systemMessageTokens,
          },
          parts: event.parts,
        };

        // Update history with completed message (mirrors real StreamManager behavior)
        // Fetch the current message from history to get its historySequence
        const historyResult = await this.deps.historyService.getHistory(workspaceId);
        if (historyResult.success) {
          const existingMessage = historyResult.data.find((msg) => msg.id === messageId);
          if (existingMessage?.metadata?.historySequence !== undefined) {
            const completedMessage: CmuxMessage = {
              id: messageId,
              role: "assistant",
              parts: event.parts,
              metadata: {
                ...existingMessage.metadata,
                model: event.metadata.model,
                systemMessageTokens: event.metadata.systemMessageTokens,
              },
            };
            const updateResult = await this.deps.historyService.updateHistory(
              workspaceId,
              completedMessage
            );

            if (!updateResult.success) {
              console.error(`Failed to update history for ${messageId}: ${updateResult.error}`);
            }
          }
        }

        console.log("[MockScenarioPlayer] Emitting stream-end event:", {
          workspaceId,
          messageId,
          eventType: payload.type,
        });
        this.deps.aiService.emit("stream-end", payload);
        console.log("[MockScenarioPlayer] stream-end event emitted");
        this.cleanup(workspaceId);
        break;
      }
    }
  }

  private cleanup(workspaceId: string): void {
    const active = this.activeStreams.get(workspaceId);
    if (!active) return;
    for (const timer of active.timers) {
      clearTimeout(timer);
    }
    this.activeStreams.delete(workspaceId);
  }

  private extractText(message: CmuxMessage): string {
    return message.parts
      .filter((part) => "text" in part)
      .map((part) => (part as { text: string }).text)
      .join("");
  }

  private computeNextHistorySequence(messages: CmuxMessage[]): number {
    let maxSequence = 0;
    for (const message of messages) {
      const seq = message.metadata?.historySequence;
      if (typeof seq === "number" && seq > maxSequence) {
        maxSequence = seq;
      }
    }
    return maxSequence + 1;
  }

  private findTurnIndex(text: string): number {
    const normalizedText = text.trim();
    for (let index = 0; index < this.scenarios.length; index += 1) {
      if (this.completedTurns.has(index)) {
        continue;
      }
      const candidate = this.scenarios[index];
      if (candidate.user.text.trim() === normalizedText) {
        return index;
      }
    }
    return -1;
  }
}
