/**
 * Apply centralized tool-output redaction to a list of CmuxMessages.
 * Produces a cloned array safe for sending to providers without touching persisted history/UI.
 */
import type { CmuxMessage } from "@/types/message";
import type { DynamicToolPart } from "@/types/toolParts";
import { redactToolOutput } from "./toolOutputRedaction";

export function applyToolOutputRedaction(messages: CmuxMessage[]): CmuxMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;

    const newParts = msg.parts.map((part) => {
      if (part.type !== "dynamic-tool") return part;

      const toolPart = part as DynamicToolPart;
      if (toolPart.state !== "output-available") return part;

      const redacted: typeof toolPart = {
        ...toolPart,
        output: redactToolOutput(toolPart.toolName, toolPart.output),
      };
      return redacted;
    });

    return {
      ...msg,
      parts: newParts,
    } satisfies CmuxMessage;
  });
}
