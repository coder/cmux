import type { ReactNode } from "react";
import React, { Component } from "react";
import styled from "@emotion/styled";

const ErrorContainer = styled.div`
  padding: 20px;
  background: #3c1f1f;
  border: 1px solid #f48771;
  border-radius: 4px;
  color: #f48771;
  margin: 20px;
`;

const ErrorTitle = styled.h3`
  margin: 0 0 10px 0;
  font-size: 16px;
`;

const ErrorDetails = styled.pre`
  margin: 10px 0;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
`;

const ResetButton = styled.button`
  padding: 8px 16px;
  background: #f48771;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: #ff9980;
  }
`;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  workspaceInfo?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorContainer>
          <ErrorTitle>
            Something went wrong{this.props.workspaceInfo && ` in ${this.props.workspaceInfo}`}
          </ErrorTitle>
          {this.state.error && (
            <ErrorDetails>
              {this.state.error.toString()}
              {this.state.errorInfo && (
                <>
                  <br />
                  {this.state.errorInfo.componentStack}
                </>
              )}
            </ErrorDetails>
          )}
          <ResetButton onClick={this.handleReset}>Reset</ResetButton>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}
