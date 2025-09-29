import React from "react";
import styled from "@emotion/styled";

const ErrorContainer = styled.div`
  background-color: var(--color-error-bg, #fee);
  color: var(--color-error-text, #c00);
  border: 1px solid var(--color-error-border, #fcc);
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
  font-family: var(--font-monospace);
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ErrorTitle = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ErrorIcon = styled.span`
  font-size: 18px;
`;

const ErrorDetails = styled.div`
  opacity: 0.9;
`;

interface ErrorMessageProps {
  title?: string;
  message: string;
  details?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ title, message, details }) => {
  return (
    <ErrorContainer>
      {title && (
        <ErrorTitle>
          <ErrorIcon>⚠️</ErrorIcon>
          {title}
        </ErrorTitle>
      )}
      <div>{message}</div>
      {details && <ErrorDetails>{details}</ErrorDetails>}
    </ErrorContainer>
  );
};
