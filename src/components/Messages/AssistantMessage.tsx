import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "@/types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";
import { useStartHere } from "@/hooks/useStartHere";
import { COMPACTED_EMOJI } from "@/constants/ui";
import { ModelDisplay } from "./ModelDisplay";
import { CompactingMessageContent } from "./CompactingMessageContent";
import { CompactionBackground } from "./CompactionBackground";
import type { KebabMenuItem } from "@/components/KebabMenu";

const RawContent = styled.pre`
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
`;

const WaitingMessage = styled.div`
  font-family: var(--font-primary);
  font-size: 13px;
  color: var(--color-text-secondary);
  font-style: italic;
`;

const LabelContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CompactedBadge = styled.span`
  color: var(--color-plan-mode);
  font-weight: 500;
  font-size: 10px;
  padding: 2px 6px;
  background: var(--color-plan-mode-alpha);
  border-radius: 3px;
  text-transform: uppercase;
`;

interface AssistantMessageProps {
  message: DisplayedMessage & { type: "assistant" };
  className?: string;
  workspaceId?: string;
  isCompacting?: boolean;
  clipboardWriteText?: (data: string) => Promise<void>;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  className,
  workspaceId,
  isCompacting = false,
  clipboardWriteText = (data: string) => navigator.clipboard.writeText(data),
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const content = message.content;
  const isStreaming = message.isStreaming;
  const isCompacted = message.isCompacted;
  const isStreamingCompaction = isStreaming && isCompacting;

  // Use Start Here hook for final assistant messages
  const {
    openModal,
    buttonLabel,
    buttonEmoji,
    disabled: startHereDisabled,
    modal,
  } = useStartHere(workspaceId, content, isCompacted);

  const handleCopy = async () => {
    try {
      await clipboardWriteText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Keep only Copy button visible, move rest to kebab menu
  const buttons: ButtonConfig[] = isStreaming
    ? []
    : [
        {
          label: copied ? "✓ Copied" : "Copy Text",
          onClick: () => void handleCopy(),
        },
      ];

  // Kebab menu items (hidden actions)
  const kebabMenuItems: KebabMenuItem[] = isStreaming
    ? []
    : [
        // Add Start Here button if workspaceId is available and message is not already compacted
        ...(workspaceId && !isCompacted
          ? [
              {
                label: buttonLabel,
                emoji: buttonEmoji,
                onClick: openModal,
                disabled: startHereDisabled,
                tooltip: "Replace all chat history with this message",
              },
            ]
          : []),
        {
          label: showRaw ? "Show Markdown" : "Show Text",
          onClick: () => setShowRaw(!showRaw),
          active: showRaw,
        },
      ];

  // Render appropriate content based on state
  const renderContent = () => {
    // Empty streaming state
    if (isStreaming && !content) {
      return <WaitingMessage>Waiting for response...</WaitingMessage>;
    }

    // Streaming text gets typewriter effect
    if (isStreaming) {
      const contentElement = <TypewriterMarkdown deltas={[content]} isComplete={false} />;

      // Wrap streaming compaction in special container
      if (isStreamingCompaction) {
        return <CompactingMessageContent>{contentElement}</CompactingMessageContent>;
      }

      return contentElement;
    }

    // Completed text renders as static content
    return content ? (
      showRaw ? (
        <RawContent>{content}</RawContent>
      ) : (
        <MarkdownRenderer content={content} />
      )
    ) : null;
  };

  // Create label with model name and compacted indicator if applicable
  const renderLabel = () => {
    const modelName = message.model;
    const isCompacted = message.isCompacted;

    return (
      <LabelContainer>
        {modelName && <ModelDisplay modelString={modelName} />}
        {isCompacted && <CompactedBadge>{COMPACTED_EMOJI} compacted</CompactedBadge>}
      </LabelContainer>
    );
  };

  return (
    <>
      <MessageWindow
        label={renderLabel()}
        borderColor="var(--color-assistant-border)"
        message={message}
        buttons={buttons}
        kebabMenuItems={kebabMenuItems}
        className={className}
        backgroundEffect={isStreamingCompaction ? <CompactionBackground /> : undefined}
      >
        {renderContent()}
      </MessageWindow>

      {modal}
    </>
  );
};
