import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { TypewriterText } from "./TypewriterText";

const MessageBlock = styled.div<{ type: string; isError?: boolean }>`
  margin-bottom: 15px;
  margin-top: 15px;
  background: ${(props) => {
    switch (props.type) {
      case "user":
        return "#2d2d30";
      case "assistant":
        return "#1e1e1e";
      case "system":
        return "#1a1d29";
      case "result":
        return props.isError ? "#3c1f1f" : "#1f3c1f";
      case "stream_event":
        return "#1a1d29";
      default:
        return "#1e1e1e";
    }
  }};
  border-left: 3px solid
    ${(props) => {
      switch (props.type) {
        case "user":
          return "#569cd6";
        case "assistant":
          return "#4ec9b0";
        case "system":
          return "#808080";
        case "result":
          return props.isError ? "#f48771" : "#b5cea8";
        case "stream_event":
          return "#d4a853";
        default:
          return "#3e3e42";
      }
    }};
  border-radius: 3px;
  overflow: hidden;
`;

const MessageHeader = styled.div`
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #cccccc;
  font-weight: 500;
`;

const MessageTypeLabel = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ToggleButton = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cccccc;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }

  &:active {
    background: rgba(255, 255, 255, 0.15);
  }
`;

const MessageContent = styled.div`
  padding: 12px;
`;

const FormattedContent = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const JsonContent = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 3px;
  overflow-x: auto;
`;

const PartialIndicator = styled.div`
  font-size: 10px;
  color: #d4a853;
  margin-bottom: 4px;
  font-style: italic;
`;


interface ClaudeMessageProps {
  message: UIMessage;
  className?: string;
}

export const ClaudeMessage: React.FC<ClaudeMessageProps> = ({
  message,
  className,
}) => {
  const [showJson, setShowJson] = useState(false);

  const getHeaderText = (): string => {
    const originalMsg = message.metadata?.originalSDKMessage;
    if (originalMsg?.subtype && message.type !== originalMsg.subtype) {
      return `${message.type} / ${originalMsg.subtype}`;
    }
    return message.type;
  };

  const headerText = getHeaderText();
  const isStreaming = message.isStreaming || false;

  return (
    <MessageBlock type={message.type} className={className}>
      <MessageHeader>
        <MessageTypeLabel>{headerText}</MessageTypeLabel>
        <ToggleButton onClick={() => setShowJson(!showJson)}>
          {showJson ? "Hide JSON" : "Show JSON"}
        </ToggleButton>
      </MessageHeader>

      <MessageContent>
        {isStreaming && <PartialIndicator>streaming...</PartialIndicator>}

        {showJson ? (
          <JsonContent>
            {JSON.stringify(
              message.metadata?.originalSDKMessage || message,
              null,
              2
            )}
          </JsonContent>
        ) : (
          <>
            {isStreaming && message.contentDeltas ? (
              <TypewriterText 
                deltas={message.contentDeltas} 
                isComplete={!isStreaming}
                speed={50}
              />
            ) : (
              <FormattedContent>
                {typeof message.content === 'string' 
                  ? message.content 
                  : JSON.stringify(message.content, null, 2)}
              </FormattedContent>
            )}
          </>
        )}
      </MessageContent>
    </MessageBlock>
  );
};
