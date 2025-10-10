import { describe, expect, test } from "bun:test";
import { EventEmitter } from "events";
import { MockScenarioPlayer } from "./mockScenarioPlayer";
import { createCmuxMessage, type CmuxMessage } from "@/types/message";
import { allScenarios } from "./scenarios";
import { Ok } from "@/types/result";
import type { HistoryService } from "@/services/historyService";
import type { AIService } from "@/services/aiService";

class InMemoryHistoryService {
  public appended: Array<{ workspaceId: string; message: CmuxMessage }> = [];
  private nextSequence = 0;

  appendToHistory(workspaceId: string, message: CmuxMessage) {
    message.metadata ??= {};

    if (message.metadata.historySequence === undefined) {
      message.metadata.historySequence = this.nextSequence++;
    } else if (message.metadata.historySequence >= this.nextSequence) {
      this.nextSequence = message.metadata.historySequence + 1;
    }

    this.appended.push({ workspaceId, message });
    return Promise.resolve(Ok(undefined));
  }
}

describe("MockScenarioPlayer", () => {
  test("appends assistant placeholder even when scripted turn ends with stream error", async () => {
    const historyStub = new InMemoryHistoryService();
    const aiServiceStub = new EventEmitter();

    const player = new MockScenarioPlayer({
      historyService: historyStub as unknown as HistoryService,
      aiService: aiServiceStub as unknown as AIService,
    });

    const workspaceId = "workspace-1";

    const listLanguagesTurn = allScenarios.find(
      (turn) => turn.user.text === "List 3 programming languages"
    );
    const openDocTurn = allScenarios.find((turn) => turn.user.text === "Open the onboarding doc.");

    if (!listLanguagesTurn || !openDocTurn) {
      throw new Error("Required mock scenario turns not defined");
    }

    const firstTurnUser = createCmuxMessage("user-1", "user", listLanguagesTurn.user.text, {
      timestamp: Date.now(),
    });

    const firstResult = await player.play([firstTurnUser], workspaceId);
    expect(firstResult.success).toBe(true);
    player.stop(workspaceId);

    const historyBeforeSecondTurn = historyStub.appended.map((entry) => entry.message);
    const secondTurnUser = createCmuxMessage("user-2", "user", openDocTurn.user.text, {
      timestamp: Date.now(),
    });

    const secondResult = await player.play(
      [firstTurnUser, ...historyBeforeSecondTurn, secondTurnUser],
      workspaceId
    );
    expect(secondResult.success).toBe(true);

    expect(historyStub.appended).toHaveLength(2);
    const [firstAppend, secondAppend] = historyStub.appended;
    expect(firstAppend.message.id).toBe(listLanguagesTurn.assistant.messageId);
    expect(secondAppend.message.id).toBe(openDocTurn.assistant.messageId);

    const firstSeq = firstAppend.message.metadata?.historySequence ?? -1;
    const secondSeq = secondAppend.message.metadata?.historySequence ?? -1;
    expect(secondSeq).toBe(firstSeq + 1);

    player.stop(workspaceId);
  });
});
