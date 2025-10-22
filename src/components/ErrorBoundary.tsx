import type { ReactNode } from "react";
import React, { Component } from "react";

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
        <div className="p-5 bg-[#3c1f1f] border border-[#f48771] rounded text-[#f48771] m-5">
          <h3 className="m-0 mb-2.5 text-base">
            Something went wrong{this.props.workspaceInfo && ` in ${this.props.workspaceInfo}`}
          </h3>
          {this.state.error && (
            <pre className="my-2.5 p-2.5 bg-black/30 rounded-sm text-xs whitespace-pre-wrap break-all">
              {this.state.error.toString()}
              {this.state.errorInfo && (
                <>
                  <br />
                  {this.state.errorInfo.componentStack}
                </>
              )}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="py-2 px-4 bg-[#f48771] text-white border-none rounded-sm cursor-pointer text-sm hover:bg-[#ff9980]"
          >
            Reset
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
