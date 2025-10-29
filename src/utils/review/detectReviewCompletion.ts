import type { CmuxMessage } from "@/types/message";

export interface ReviewCompletion {
  reviewSequence: number;
  assistantSequence: number;
}

function isReviewNote(message: CmuxMessage): boolean {
  if (message.role !== "user") return false;

  return message.parts.some((part) => part.type === "text" && part.text.includes("<review>"));
}

function isAssistantCompletion(message: CmuxMessage): boolean {
  if (message.role !== "assistant") return false;
  const metadata = message.metadata;

  if (!metadata) return true;

  if (metadata.partial) return false;
  if (metadata.error) return false;

  return true;
}

/**
 * Determine the latest assistant response that completes work on a submitted review.
 *
 * A review submission is detected when a user message contains a `<review>` block.
 * We consider the review "completed" once a fully-finished assistant message
 * (non-partial, non-error) appears after the review message.
 */
export function getLatestReviewCompletion(messages: CmuxMessage[]): ReviewCompletion | null {
  if (messages.length === 0) return null;

  const sorted = [...messages].sort((a, b) => {
    const aSeq = a.metadata?.historySequence ?? 0;
    const bSeq = b.metadata?.historySequence ?? 0;
    return aSeq - bSeq;
  });

  let latestReviewSequence: number | null = null;
  let latestCompletion: ReviewCompletion | null = null;

  for (const message of sorted) {
    const sequence = message.metadata?.historySequence;
    if (sequence == null) continue;

    if (isReviewNote(message)) {
      latestReviewSequence = sequence;
      latestCompletion = null; // Reset when a newer review note is submitted
      continue;
    }

    if (latestReviewSequence == null) {
      continue;
    }

    if (sequence <= latestReviewSequence) {
      continue;
    }

    if (isAssistantCompletion(message)) {
      latestCompletion = {
        reviewSequence: latestReviewSequence,
        assistantSequence: sequence,
      };
    }
  }

  return latestCompletion;
}

