import React from "react";
import styled from "@emotion/styled";
import { SendMessageError as SendMessageErrorType } from "../types/errors";

const ErrorContainer = styled.div`
  background: #2d1f1f;
  border: 1px solid #5a2c2c;
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #f48771;
`;

const ErrorTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-weight: 600;
`;

const ErrorIcon = styled.span`
  font-size: 14px;
`;

const ErrorDetails = styled.div`
  color: #d4d4d4;
  line-height: 1.4;
  margin-bottom: 6px;
`;

const ErrorSolution = styled.div`
  background: #1e1e1e;
  border-radius: 3px;
  padding: 6px 8px;
  margin-top: 8px;
  font-family: "Monaco", "Menlo", monospace;
  font-size: 11px;
  color: #9cdcfe;
`;

const SolutionLabel = styled.div`
  color: #808080;
  font-size: 10px;
  margin-bottom: 4px;
  text-transform: uppercase;
`;

interface SendMessageErrorProps {
  error: SendMessageErrorType;
}

export const SendMessageError: React.FC<SendMessageErrorProps> = ({ error }) => {
  // Generate user-friendly error content based on error type
  const getErrorContent = () => {
    switch (error.type) {
      case "api_key_not_found":
        return {
          title: "API Key Not Found",
          details: `The ${error.provider} provider requires an API key to function.`,
          solution: (
            <>
              <SolutionLabel>Quick Fix:</SolutionLabel>
              /providers set {error.provider} apiKey YOUR_API_KEY
            </>
          ),
        };

      case "provider_not_configured":
        return {
          title: "Provider Not Configured",
          details: `The ${error.provider} provider needs to be configured before use.`,
          solution: (
            <>
              <SolutionLabel>Configure Provider:</SolutionLabel>
              /providers set {error.provider} apiKey YOUR_API_KEY
              <br />
              /providers set {error.provider} baseUrl https://api.{error.provider}.com
            </>
          ),
        };

      case "invalid_model_string":
        return {
          title: "Invalid Model Format",
          details: error.message,
          solution: (
            <>
              <SolutionLabel>Expected Format:</SolutionLabel>
              provider:model-name (e.g., anthropic:claude-opus-4-1)
            </>
          ),
        };

      case "unknown":
      default:
        return {
          title: "Message Send Failed",
          details: error.raw || "An unexpected error occurred while sending your message.",
          solution: null,
        };
    }
  };

  const { title, details, solution } = getErrorContent();

  return (
    <ErrorContainer>
      <ErrorTitle>
        <ErrorIcon>⚠</ErrorIcon>
        {title}
      </ErrorTitle>
      <ErrorDetails>{details}</ErrorDetails>
      {solution && <ErrorSolution>{solution}</ErrorSolution>}
    </ErrorContainer>
  );
};
