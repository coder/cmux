import React, { useState } from "react";
import type { DisplayedMessage } from "@/types/message";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";
import { TerminalOutput } from "./TerminalOutput";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import type { KebabMenuItem } from "@/components/KebabMenu";

interface UserMessageProps {
  message: DisplayedMessage & { type: "user" };
  className?: string;
  onEdit?: (messageId: string, content: string) => void;
  isCompacting?: boolean;
  clipboardWriteText?: (data: string) => Promise<void>;
}

async function defaultClipboardWriteText(data: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(data);
    return;
  }

  console.warn("Clipboard API is not available; skipping copy action.");
}

export const UserMessage: React.FC<UserMessageProps> = ({
  message,
  className,
  onEdit,
  isCompacting,
  clipboardWriteText = defaultClipboardWriteText,
}) => {
  const [copied, setCopied] = useState(false);

  const content = message.content;

  console.assert(
    typeof clipboardWriteText === "function",
    "UserMessage expects clipboardWriteText to be a callable function."
  );

  // Check if this is a local command output
  const isLocalCommandOutput =
    content.startsWith("<local-command-stdout>") && content.endsWith("</local-command-stdout>");

  // Extract the actual output if it's a local command
  const extractedOutput = isLocalCommandOutput
    ? content.slice("<local-command-stdout>".length, -"</local-command-stdout>".length).trim()
    : "";

  const handleCopy = async () => {
    console.assert(
      typeof content === "string",
      "UserMessage copy handler expects message content to be a string."
    );

    try {
      await clipboardWriteText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleEdit = () => {
    if (onEdit && !isLocalCommandOutput) {
      onEdit(message.historyId, content);
    }
  };

  // Keep Copy and Edit buttons visible (most common actions)
  // Kebab menu saves horizontal space by collapsing less-used actions
  const buttons: ButtonConfig[] = [
    ...(onEdit && !isLocalCommandOutput
      ? [
          {
            label: "Edit",
            onClick: handleEdit,
            disabled: isCompacting,
            tooltip: isCompacting
              ? `Cannot edit while compacting (${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel)`
              : undefined,
          },
        ]
      : []),
    {
      label: copied ? "✓ Copied" : "Copy",
      onClick: () => void handleCopy(),
    },
  ];

  // Currently no additional kebab items for user messages
  // MessageWindow will add "Show JSON" to kebab menu automatically if kebabMenuItems is provided
  const kebabMenuItems: KebabMenuItem[] = [];

  // If it's a local command output, render with TerminalOutput
  if (isLocalCommandOutput) {
    return (
      <MessageWindow
        label="USER"
        borderColor="var(--color-user-border)"
        message={message}
        buttons={buttons}
        kebabMenuItems={kebabMenuItems}
        className={className}
      >
        <TerminalOutput output={extractedOutput} isError={false} />
      </MessageWindow>
    );
  }

  // Otherwise, render as normal user message
  return (
    <MessageWindow
      label="USER"
      borderColor="var(--color-user-border)"
      message={message}
      buttons={buttons}
      kebabMenuItems={kebabMenuItems}
      className={className}
    >
      {content && (
        <pre className="m-0 font-mono text-xs leading-4 whitespace-pre-wrap break-words text-[#999999] opacity-90">
          {content}
        </pre>
      )}
      {message.imageParts && message.imageParts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {message.imageParts.map((img, idx) => (
            <img
              key={idx}
              src={img.url}
              alt={`Attachment ${idx + 1}`}
              className="max-w-[300px] max-h-[300px] rounded border border-border-light"
            />
          ))}
        </div>
      )}
    </MessageWindow>
  );
};
