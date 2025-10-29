import type { CmuxMessage } from "@/types/message";
import { getLatestReviewCompletion } from "./detectReviewCompletion";

describe("getLatestReviewCompletion", () => {
  const baseMessage = (partial: Partial<CmuxMessage>): CmuxMessage => ({
    id: "id",
    role: "user",
    parts: [],
    metadata: {
      historySequence: 0,
    },
    ...partial,
  });

  const textPart = (text: string) => ({ type: "text" as const, text });

  it("returns null when there are no review notes", () => {
    const messages: CmuxMessage[] = [
      baseMessage({ role: "user", metadata: { historySequence: 1 }, parts: [textPart("hello")] }),
    ];

    expect(getLatestReviewCompletion(messages)).toBeNull();
  });

  it("returns null when review note has no assistant response", () => {
    const messages: CmuxMessage[] = [
      baseMessage({
        role: "user",
        metadata: { historySequence: 1 },
        parts: [textPart("<review>note</review>")],
      }),
    ];

    expect(getLatestReviewCompletion(messages)).toBeNull();
  });

  it("detects assistant completion after review note", () => {
    const messages: CmuxMessage[] = [
      baseMessage({
        role: "user",
        metadata: { historySequence: 1 },
        parts: [textPart("<review>note</review>")],
      }),
      baseMessage({
        id: "assistant",
        role: "assistant",
        metadata: { historySequence: 2 },
        parts: [textPart("done")],
      }),
    ];

    expect(getLatestReviewCompletion(messages)).toEqual({ reviewSequence: 1, assistantSequence: 2 });
  });

  it("ignores partial assistant messages", () => {
    const messages: CmuxMessage[] = [
      baseMessage({
        role: "user",
        metadata: { historySequence: 1 },
        parts: [textPart("<review>note</review>")],
      }),
      baseMessage({
        id: "assistant",
        role: "assistant",
        metadata: { historySequence: 2, partial: true },
        parts: [textPart("still working")],
      }),
    ];

    expect(getLatestReviewCompletion(messages)).toBeNull();
  });

  it("resets when a newer review note is submitted", () => {
    const messages: CmuxMessage[] = [
      baseMessage({
        role: "user",
        metadata: { historySequence: 1 },
        parts: [textPart("<review>first</review>")],
      }),
      baseMessage({
        id: "assistant-1",
        role: "assistant",
        metadata: { historySequence: 2 },
        parts: [textPart("done")],
      }),
      baseMessage({
        id: "user-2",
        role: "user",
        metadata: { historySequence: 3 },
        parts: [textPart("<review>second</review>")],
      }),
      baseMessage({
        id: "assistant-2",
        role: "assistant",
        metadata: { historySequence: 4 },
        parts: [textPart("second done")],
      }),
    ];

    expect(getLatestReviewCompletion(messages)).toEqual({ reviewSequence: 3, assistantSequence: 4 });
  });

  it("sorts messages by history sequence before evaluation", () => {
    const messages: CmuxMessage[] = [
      baseMessage({
        id: "assistant",
        role: "assistant",
        metadata: { historySequence: 3 },
        parts: [textPart("after")],
      }),
      baseMessage({
        role: "user",
        metadata: { historySequence: 1 },
        parts: [textPart("<review>note</review>")],
      }),
      baseMessage({
        id: "assistant-partial",
        role: "assistant",
        metadata: { historySequence: 2, partial: true },
        parts: [textPart("partial")],
      }),
    ];

    expect(getLatestReviewCompletion(messages)).toEqual({ reviewSequence: 1, assistantSequence: 3 });
  });
});

