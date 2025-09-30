import * as fs from "fs";
import * as path from "path";
import { getSessionDir } from "../config";
import { CmuxMessage } from "../types/message";
import { calculateTokenStats } from "../utils/tokenStatsCalculator";

/**
 * Debug command to display cost/token statistics for a workspace
 * Usage: bun debug costs <workspace-id>
 */
export async function costsCommand(workspaceId: string) {
  console.log(`\n=== Cost Statistics for workspace: ${workspaceId} ===\n`);

  // Load chat history
  const sessionDir = getSessionDir(workspaceId);
  const chatHistoryPath = path.join(sessionDir, "chat.jsonl");

  if (!fs.existsSync(chatHistoryPath)) {
    console.log(`No chat history found at: ${chatHistoryPath}`);
    return;
  }

  // Read and parse messages
  const data = fs.readFileSync(chatHistoryPath, "utf-8");
  const messages: CmuxMessage[] = data
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CmuxMessage);

  if (messages.length === 0) {
    console.log("No messages in chat history");
    return;
  }

  // Detect model from first assistant message
  const firstAssistantMessage = messages.find((msg) => msg.role === "assistant");
  const model = firstAssistantMessage?.metadata?.model || "anthropic:claude-opus-4-1";

  // Calculate stats using shared logic
  const stats = await calculateTokenStats(messages, model);

  // Display results
  console.log(`Model: ${stats.model}`);
  console.log(`Tokenizer: ${stats.tokenizerName}`);
  console.log(`\nTotal Messages: ${messages.length}`);
  console.log(`\nContent Tokens (Estimated): ${stats.totalTokens.toLocaleString()}`);
  console.log(`(Actual API costs include system overhead)\n`);

  console.log("Breakdown by Consumer:");
  const maxNameLength = Math.max(...stats.consumers.map((c) => c.name.length), 10);

  for (const consumer of stats.consumers) {
    const namepadded = consumer.name.padEnd(maxNameLength);

    // Format token display - show k for thousands with 1 decimal, include breakdown in separate columns
    const tokenDisplay =
      consumer.tokens >= 1000
        ? `${(consumer.tokens / 1000).toFixed(1)}k`
        : consumer.tokens.toString();

    const tokensFormatted = tokenDisplay.padStart(7);
    const percentageFormatted = `(${consumer.percentage.toFixed(1)}%)`.padStart(8);

    // Add breakdown info if both fixed and variable exist
    const breakdownInfo =
      consumer.fixedTokens && consumer.variableTokens
        ? ` [${consumer.fixedTokens} def + ${consumer.variableTokens} usage]`
        : "";

    // Create simple bar chart (each █ = 2%)
    const barLength = Math.round(consumer.percentage / 2);
    const bar = "█".repeat(barLength);

    console.log(
      `  ${namepadded}  ${tokensFormatted} ${percentageFormatted} ${bar}${breakdownInfo}`
    );
  }

  // Display last actual usage from API if available
  if (stats.lastUsage) {
    console.log(`\nLast API Response:`);
    console.log(`  Prompt Tokens:     ${stats.lastUsage.promptTokens.toLocaleString()}`);
    console.log(`  Completion Tokens: ${stats.lastUsage.completionTokens.toLocaleString()}`);
    console.log(`  Total Tokens:      ${stats.lastUsage.totalTokens.toLocaleString()}`);
  }

  // Display message breakdown
  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant").length;
  const toolCalls = messages
    .filter((m) => m.role === "assistant")
    .reduce((count, msg) => {
      return (
        count +
        msg.parts.filter((p) => p.type === "dynamic-tool" && p.type === "dynamic-tool").length
      );
    }, 0);

  console.log(`\nRaw Data:`);
  console.log(`  - User messages: ${userMessages}`);
  console.log(`  - Assistant messages: ${assistantMessages}`);
  console.log(`  - Tool calls: ${toolCalls}`);
  console.log();
}
