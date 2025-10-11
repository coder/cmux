import assert from "node:assert/strict";
import type { CmuxReasoningPart, CmuxTextPart, CmuxToolPart } from "@/types/message";

export function extractAssistantText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const textParts = (parts as CmuxTextPart[]).filter(
    (part): part is CmuxTextPart => part.type === "text"
  );
  return textParts
    .map((part) => {
      assert(typeof part.text === "string", "Text part must include text");
      return part.text;
    })
    .join("");
}

export function extractReasoning(parts: unknown): string[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  const reasoningParts = (parts as CmuxReasoningPart[]).filter(
    (part): part is CmuxReasoningPart => part.type === "reasoning"
  );
  return reasoningParts.map((part) => {
    assert(typeof part.text === "string", "Reasoning part must include text");
    return part.text;
  });
}

export function extractToolCalls(parts: unknown): CmuxToolPart[] {
  if (!Array.isArray(parts)) {
    return [];
  }

  return (parts as CmuxToolPart[]).filter(
    (part): part is CmuxToolPart => part.type === "dynamic-tool"
  );
}
