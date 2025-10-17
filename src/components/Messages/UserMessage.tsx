import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "@/types/message";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";
import { TerminalOutput } from "./TerminalOutput";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

const FormattedContent = styled.pre`
  margin: 0;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #999999;
  opacity: 0.9;
`;

const ImageContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

const MessageImage = styled.img`
  max-width: 300px;
  max-height: 300px;
  border-radius: 4px;
  border: 1px solid #3e3e42;
`;

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

  const buttons: ButtonConfig[] = [
    ...(onEdit && !isLocalCommandOutput
      ? [
          {
            label: "Edit",
            onClick: handleEdit,
            disabled: isCompacting,
            tooltip: isCompacting
              ? `Cannot edit while compacting (press ${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel)`
              : undefined,
          },
        ]
      : []),
    {
      label: copied ? "✓ Copied" : "Copy Text",
      onClick: () => void handleCopy(),
    },
  ];

  // If it's a local command output, render with TerminalOutput
  if (isLocalCommandOutput) {
    return (
      <MessageWindow
        label="USER"
        borderColor="var(--color-user-border)"
        message={message}
        buttons={buttons}
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
      className={className}
    >
      {content && <FormattedContent>{content}</FormattedContent>}
      {message.imageParts && message.imageParts.length > 0 && (
        <ImageContainer>
          {message.imageParts.map((img, idx) => (
            <MessageImage key={idx} src={img.url} alt={`Attachment ${idx + 1}`} />
          ))}
        </ImageContainer>
      )}
    </MessageWindow>
  );
};
