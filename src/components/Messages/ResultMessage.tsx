import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";

const ResultContainer = styled.div<{ isError?: boolean }>`
  margin: 4px 0;
  padding: 4px 8px;
  background: ${(props) => (props.isError ? "#3c1f1f" : "#1f3c1f")};
  border-left: 2px solid ${(props) => (props.isError ? "#f48771" : "#b5cea8")};
  border-radius: 2px;
  font-size: 10px;
  color: ${(props) => (props.isError ? "#f48771" : "#b5cea8")};
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
`;

const ResultContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
`;

const ResultIcon = styled.span`
  font-size: 8px;
`;

const ResultText = styled.span`
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ResultDetails = styled.span`
  color: #9e9e9e;
  font-weight: normal;
  margin-left: 4px;
`;

const ToggleButton = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #808080;
  padding: 1px 4px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
  }
`;

const JsonContent = styled.pre`
  margin: 4px 0 0 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 9px;
  line-height: 1.3;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 6px;
  border-radius: 2px;
  overflow-x: auto;
  max-height: 100px;
  overflow-y: auto;
`;

interface ResultMessageProps {
  message: UIMessage;
  className?: string;
}

export const ResultMessage: React.FC<ResultMessageProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);

  const isError = checkIfError(message);
  const { icon, details } = formatResultMessage(message, isError);

  return (
    <div className={className}>
      <ResultContainer isError={isError}>
        <ResultContent>
          <ResultIcon>{icon}</ResultIcon>
          <ResultText>RESULT</ResultText>
          <ResultDetails>{details}</ResultDetails>
        </ResultContent>
        <ToggleButton onClick={() => setShowJson(!showJson)}>{showJson ? "−" : "+"}</ToggleButton>
      </ResultContainer>

      {showJson && (
        <JsonContent>
          {JSON.stringify(message.metadata?.originalSDKMessage || message, null, 2)}
        </JsonContent>
      )}
    </div>
  );
};

function checkIfError(message: UIMessage): boolean {
  // Check for is_error field in the extracted metadata
  if (message.metadata?.resultIsError !== undefined) {
    return message.metadata.resultIsError;
  }

  // Fallback to checking content for error keywords
  const result = message.content || message.metadata?.resultText;
  if (typeof result === "string") {
    return result.toLowerCase().includes("error") || result.toLowerCase().includes("failed");
  }
  return false;
}

function formatResultMessage(
  message: UIMessage,
  isError: boolean
): { icon: string; details: string } {
  const cost = message.metadata?.cost;
  const duration = message.metadata?.duration;
  const originalSDKMessage = message.metadata?.originalSDKMessage as any;

  let details = isError ? "Failed" : "Completed";

  if (cost) {
    details += ` • $${cost.toFixed(5)}`;
  }

  // Calculate and display context usage if modelUsage exists
  if (
    originalSDKMessage?.modelUsage &&
    message.model &&
    originalSDKMessage.modelUsage[message.model]
  ) {
    const modelData = originalSDKMessage.modelUsage[message.model];
    const usage = originalSDKMessage.usage;

    if (usage && modelData.contextWindow) {
      // Calculate total context tokens used
      const contextTokens =
        (usage.input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0);

      if (contextTokens > 0) {
        const percentage = ((contextTokens / modelData.contextWindow) * 100).toFixed(0);
        details += ` • ${formatTokens(contextTokens)}/${formatTokens(modelData.contextWindow)} (${percentage}%)`;
      }
    }
  }

  if (duration) {
    details += ` • ${formatDuration(duration)}`;
  }

  return {
    icon: isError ? "✗" : "✓",
    details,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    // Use one decimal place if less than 10k, otherwise round
    if (k < 10) {
      return `${k.toFixed(1)}k`;
    }
    return `${Math.round(k)}k`;
  }
  return `${tokens}`;
}
