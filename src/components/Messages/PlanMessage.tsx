import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { PlanMarkdownRenderer } from "./MarkdownRenderer";
import { MessageWindow, ButtonConfig } from "./MessageWindow";

const RawContent = styled.pre`
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
`;

interface PlanMessageProps {
  message: UIMessage;
  className?: string;
}

export const PlanMessage: React.FC<PlanMessageProps> = ({ message, className }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Extract the plan content from the tool input
  const getPlanContent = () => {
    // Check for plan in toolInput
    if (message.metadata?.toolInput?.plan) {
      return message.metadata.toolInput.plan;
    }

    // Check in content array for tool_use block
    if (message.content && Array.isArray(message.content)) {
      const toolBlock = message.content.find(
        (block: any) => block.type === "tool_use" && block.name === "ExitPlanMode"
      );
      if (toolBlock?.input?.plan) {
        return toolBlock.input.plan;
      }
    }

    // Check in original SDK message
    const original = message.metadata?.originalSDKMessage;
    if (original?.message?.content && Array.isArray(original.message.content)) {
      const toolBlock = original.message.content.find(
        (block: any) => block.type === "tool_use" && block.name === "ExitPlanMode"
      );
      if (toolBlock?.input?.plan) {
        return toolBlock.input.plan;
      }
    }

    // Fallback to any string content
    if (typeof message.content === "string") {
      return message.content;
    }

    return "Plan details not available";
  };

  const planContent = getPlanContent();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const buttons: ButtonConfig[] = [
    {
      label: copied ? "✓ Copied" : "Copy Text",
      onClick: handleCopy,
    },
    {
      label: showRaw ? "Show Markdown" : "Show Text",
      onClick: () => setShowRaw(!showRaw),
      active: showRaw,
    },
  ];

  return (
    <MessageWindow
      label="PLAN"
      borderColor="var(--color-plan-mode)"
      backgroundColor="var(--color-plan-mode-alpha)"
      message={message}
      buttons={buttons}
      className={className}
    >
      {showRaw ? (
        <RawContent>{planContent}</RawContent>
      ) : (
        <PlanMarkdownRenderer content={planContent} />
      )}
    </MessageWindow>
  );
};
