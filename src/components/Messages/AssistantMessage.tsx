import React, { useState } from "react";
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

  // Keep only Copy button visible (most common action)
  // Kebab menu saves horizontal space by collapsing less-used actions into a single ⋮ button
  const buttons: ButtonConfig[] = isStreaming
    ? []
    : [
        {
          label: copied ? "✓ Copied" : "Copy",
          onClick: () => void handleCopy(),
        },
      ];

  // Kebab menu items (less frequently used actions)
  const kebabMenuItems: KebabMenuItem[] = isStreaming
    ? []
    : [
        // Add Start Here button if workspaceId is available and message is not already compacted
        ...(workspaceId && !isCompacted
          ? [
              {
                label: buttonLabel,
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
      return (
        <div className="font-primary text-[13px] text-secondary italic">
          Waiting for response...
        </div>
      );
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
        <pre className="font-mono text-xs leading-relaxed text-text whitespace-pre-wrap break-words m-0 p-2 bg-code-bg rounded-sm">
          {content}
        </pre>
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
      <div className="flex items-center gap-2">
        {modelName && <ModelDisplay modelString={modelName} />}
        {isCompacted && (
          <span className="text-plan-mode font-medium text-[10px] px-1.5 py-0.5 bg-plan-mode/10 rounded-sm uppercase">
            {COMPACTED_EMOJI} compacted
          </span>
        )}
      </div>
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
