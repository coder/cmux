/**
 * Type definitions for dynamic tool parts
 */

export interface DynamicToolPartAvailable {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  state: "output-available";
  input: unknown;
  output: unknown;
  timestamp?: number;
}

export interface DynamicToolPartPending {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  state: "input-available";
  input: unknown;
  timestamp?: number;
}

export type DynamicToolPart = DynamicToolPartAvailable | DynamicToolPartPending;

export function isDynamicToolPart(part: unknown): part is DynamicToolPart {
  return (
    typeof part === "object" && part !== null && "type" in part && part.type === "dynamic-tool"
  );
}

export function isDynamicToolPartAvailable(part: unknown): part is DynamicToolPartAvailable {
  return isDynamicToolPart(part) && part.state === "output-available";
}

export function isDynamicToolPartPending(part: unknown): part is DynamicToolPartPending {
  return isDynamicToolPart(part) && part.state === "input-available";
}
