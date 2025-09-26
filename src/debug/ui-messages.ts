import { readFile } from "fs/promises";
import { join } from "path";
import { StreamingMessageAggregator } from "../utils/StreamingMessageAggregator";
import { SESSIONS_DIR } from "../config";

export async function uiMessagesCommand(
  workspaceKey?: string,
  dropLast: number = 0,
  limit: number = 64
) {
  if (!workspaceKey) {
    console.error("Error: --workspace required");
    process.exit(1);
  }

  try {
    // Load workspace data from NDJSON file
    const historyFile = join(SESSIONS_DIR, workspaceKey, "chat_history.ndjson");
    const ndjson = await readFile(historyFile, "utf-8");
    const history = ndjson
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    // Drop last N messages if requested
    let messagesToProcess = dropLast > 0 ? history.slice(0, -dropLast) : history;

    // Limit to most recent messages (default: 64)
    if (limit > 0 && messagesToProcess.length > limit) {
      messagesToProcess = messagesToProcess.slice(-limit);
    }

    // Process through same aggregator as UI
    const aggregator = new StreamingMessageAggregator();

    messagesToProcess.forEach((sdkMsg: any) => {
      aggregator.processSDKMessage(sdkMsg);
    });

    const uiMessages = aggregator.getAllMessages();

    // Display clean summary
    console.log(`\nUI Messages for workspace: ${workspaceKey}`);
    console.log(`Total SDK messages: ${history.length}`);
    if (dropLast > 0) {
      console.log(`Dropped last: ${dropLast}`);
    }
    if (limit > 0 && history.length > limit) {
      console.log(`Showing most recent: ${limit}`);
    }
    console.log(`Processed SDK messages: ${messagesToProcess.length}`);
    console.log(`Total UI messages: ${uiMessages.length}`);
    console.log("---\n");

    uiMessages.forEach((msg, i) => {
      const streamingInfo = msg.isStreaming ? " [STREAMING]" : "";
      const hasDeltas = msg.contentDeltas && msg.contentDeltas.length > 0;
      const deltaInfo = hasDeltas ? ` [${msg.contentDeltas!.length} deltas]` : "";

      // Show permission mode info
      const permissionMode = msg.metadata?.cmuxMeta?.permissionMode || "none";
      const modeInfo = ` [${permissionMode}]`;

      // Handle different content types
      let preview = "";
      if (typeof msg.content === "string") {
        preview = msg.content.slice(0, 60).replace(/\n/g, "\\n");
        if (msg.content.length > 60) preview += "...";
      } else if (msg.type === "tool_use") {
        preview = `${msg.metadata?.toolName || "unknown"}: ${JSON.stringify(msg.metadata?.toolInput || {}).slice(0, 50)}...`;
      } else if (msg.type === ("stream_event" as any)) {
        const eventType = msg.metadata?.eventType || "unknown";
        preview = `[${eventType}] (stream event)`;
      } else if (msg.type === "tool_result") {
        const toolName = msg.associatedToolUse?.name || "unknown";
        const isError = msg.toolResult?.is_error ? "[ERROR]" : "[SUCCESS]";
        const contentPreview =
          typeof msg.content === "string"
            ? msg.content.slice(0, 30).replace(/\n/g, "\\n")
            : JSON.stringify(msg.content).slice(0, 30);
        preview = `${toolName} ${isError} (id: ${msg.toolUseId?.slice(0, 8) || "none"}) -> ${contentPreview}...`;
      } else if (msg.content) {
        preview = JSON.stringify(msg.content).slice(0, 60) + "...";
      } else {
        preview = "(no content)";
      }

      console.log(`${i + 1}. [${msg.type}]${modeInfo}${streamingInfo}${deltaInfo} ${preview}`);
    });

    console.log("\n");

    // Output as JSON for debugging if requested
    if (process.env.JSON_OUTPUT === "true") {
      console.log(JSON.stringify(uiMessages, null, 2));
    }
  } catch (error) {
    console.error(
      `Error reading workspace ${workspaceKey}:`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
