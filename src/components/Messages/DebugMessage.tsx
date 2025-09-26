import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { useDebugMode } from "../../contexts/DebugContext";

const DebugContainer = styled.div`
  margin: 2px 0;
  padding: 3px 8px;
  background: var(--color-debug-alpha);
  border-left: 2px solid var(--color-debug);
  font-size: 10px;
  color: var(--color-debug-text);
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(74, 158, 255, 0.15);
    border-left-color: var(--color-debug-light);
  }
`;

const DebugHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const DebugIcon = styled.span`
  font-size: 9px;
  color: var(--color-debug);
`;

const DebugLabel = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 9px;
  font-weight: 600;
  color: var(--color-debug-light);
`;

const DebugInfo = styled.span`
  color: var(--color-debug-text);
  margin-left: 6px;
  opacity: 0.9;
`;

const JsonContent = styled.pre`
  margin: 4px 0 2px 12px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 8px;
  border-radius: 3px;
  border-left: 2px solid var(--color-debug);
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
`;

interface DebugMessageProps {
  message: UIMessage;
  className?: string;
}

export const DebugMessage: React.FC<DebugMessageProps> = ({ message, className }) => {
  const [expanded, setExpanded] = useState(false);
  const { debugMode } = useDebugMode();

  // Determine what kind of debug message this is
  const getDebugInfo = () => {
    const original = message.metadata?.originalSDKMessage;
    const metadata = message.metadata;

    // System init messages
    if (message.type === "system" && metadata?.systemSubtype === "init") {
      const model = metadata.systemModel || "unknown";
      const tools = metadata.systemTools?.length || 0;
      return {
        label: "INIT",
        info: `${model} • ${tools} tools`,
      };
    }

    // Stream event messages
    if (original?.type === "stream_event") {
      const eventType = original.event?.type || "unknown";
      return {
        label: "STREAM",
        info: eventType,
      };
    }

    // Tool invocation messages - check for ExitPlanMode
    if (message.metadata?.toolName === "ExitPlanMode") {
      return {
        label: "TOOL",
        info: "ExitPlanMode invocation",
      };
    }

    // Tool result messages - check for ExitPlanMode result
    if (message.type === "tool_result" && message.associatedToolUse?.name === "ExitPlanMode") {
      return {
        label: "RESULT",
        info: "ExitPlanMode result",
      };
    }

    // Empty assistant messages
    if (message.type === "assistant" && (!message.content || message.content === "")) {
      return {
        label: "EMPTY",
        info: "assistant message",
      };
    }

    // Default debug info
    return {
      label: "DEBUG",
      info: `${message.type} #${message.metadata?.cmuxMeta?.sequenceNumber || "--"}`,
    };
  };

  const { label, info } = getDebugInfo();

  // Only show debug messages when debug mode is enabled
  if (!debugMode) {
    return null;
  }

  return (
    <div className={className}>
      <DebugContainer onClick={() => setExpanded(!expanded)}>
        <DebugHeader>
          <DebugIcon>{expanded ? "▼" : "▶"}</DebugIcon>
          <DebugLabel>{label}</DebugLabel>
          <DebugInfo>{info}</DebugInfo>
        </DebugHeader>
      </DebugContainer>

      {expanded && (
        <JsonContent>
          {JSON.stringify(message.metadata?.originalSDKMessage || message, null, 2)}
        </JsonContent>
      )}
    </div>
  );
};
