/**
 * Centralized registry for redacting heavy tool outputs before sending to providers.
 *
 * Phase 1 policy:
 * - Keep tool results intact in persisted history and UI.
 * - When building provider requests, redact/compact known heavy fields.
 *
 * Why centralize:
 * - Single source of truth for redaction logic.
 * - Type safety: if a tool's result type changes, these redactors should fail type-checks.
 */

import type { FileEditInsertToolResult, FileEditReplaceToolResult } from "@/types/tools";

// Tool-output from AI SDK is often wrapped like: { type: 'json', value: <payload> }
// Keep this helper local so all redactors handle both wrapped and plain objects consistently.
function unwrapJsonContainer(output: unknown): { wrapped: boolean; value: unknown } {
  if (output && typeof output === "object" && "type" in output && "value" in output) {
    const obj = output as { type: unknown; value: unknown };
    if (obj.type === "json") {
      return { wrapped: true, value: obj.value };
    }
  }
  return { wrapped: false, value: output };
}

function rewrapJsonContainer(wrapped: boolean, value: unknown): unknown {
  if (wrapped) {
    const result: { type: string; value: unknown } = { type: "json", value };
    return result;
  }
  return value;
}

// Narrowing helpers for our tool result types
function isFileEditReplaceResult(v: unknown): v is FileEditReplaceToolResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "success" in v &&
    typeof (v as { success: unknown }).success === "boolean"
  );
}

function isFileEditInsertResult(v: unknown): v is FileEditInsertToolResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "success" in v &&
    typeof (v as { success: unknown }).success === "boolean"
  );
}

// Redactors per tool
function redactFileEditReplace(output: unknown): unknown {
  const unwrapped = unwrapJsonContainer(output);
  const val = unwrapped.value;

  if (!isFileEditReplaceResult(val)) return output; // unknown structure, leave as-is

  if (val.success) {
    const compact: FileEditReplaceToolResult = {
      success: true,
      edits_applied: val.edits_applied,
      diff: "[diff omitted in context - call file_read on the target file if needed]",
    };
    return rewrapJsonContainer(unwrapped.wrapped, compact);
  }

  // Failure payloads are small; pass through unchanged
  return output;
}

function redactFileEditInsert(output: unknown): unknown {
  const unwrapped = unwrapJsonContainer(output);
  const val = unwrapped.value;

  if (!isFileEditInsertResult(val)) return output; // unknown structure, leave as-is

  if (val.success) {
    const compact: FileEditInsertToolResult = {
      success: true,
      diff: "[diff omitted in context - call file_read on the target file if needed]",
    };
    return rewrapJsonContainer(unwrapped.wrapped, compact);
  }

  return output;
}

// Public API - registry entrypoint. Add new tools here as needed.
export function redactToolOutput(toolName: string, output: unknown): unknown {
  switch (toolName) {
    case "file_edit_replace":
      return redactFileEditReplace(output);
    case "file_edit_insert":
      return redactFileEditInsert(output);
    default:
      return output;
  }
}
