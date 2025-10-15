import React from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "@/types/message";

const ErrorContainer = styled.div`
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: 4px;
  padding: 16px 20px;
  margin: 12px 0;
`;

const ErrorHeader = styled.div`
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-error);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.2px;
`;

const ErrorIcon = styled.span`
  font-size: 16px;
  line-height: 1;
`;

const ErrorContent = styled.div`
  font-family: var(--font-monospace);
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.6;
  word-break: break-word;
`;

const ErrorType = styled.span`
  font-family: var(--font-monospace);
  font-size: 10px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.4);
  padding: 3px 8px;
  border-radius: 3px;
  letter-spacing: 0.5px;
`;

const ErrorCount = styled.span`
  font-family: var(--font-monospace);
  font-size: 10px;
  color: var(--color-error);
  background: rgba(255, 0, 0, 0.15);
  padding: 3px 8px;
  border-radius: 3px;
  letter-spacing: 0.3px;
  font-weight: 600;
  margin-left: auto;
`;

interface StreamErrorMessageProps {
  message: DisplayedMessage & { type: "stream-error" };
  className?: string;
}

// Note: RetryBarrier now handles all retry UI. This component just displays the error.
export const StreamErrorMessage: React.FC<StreamErrorMessageProps> = ({ message, className }) => {
  const showCount = message.errorCount !== undefined && message.errorCount > 1;

  return (
    <ErrorContainer className={className}>
      <ErrorHeader>
        <ErrorIcon>●</ErrorIcon>
        <span>Stream Error</span>
        <ErrorType>{message.errorType}</ErrorType>
        {showCount && <ErrorCount>×{message.errorCount}</ErrorCount>}
      </ErrorHeader>
      <ErrorContent>{message.error}</ErrorContent>
    </ErrorContainer>
  );
};
