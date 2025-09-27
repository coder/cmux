import React from "react";
import styled from "@emotion/styled";

const ResultOutput = styled.pre<{ isError?: boolean }>`
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  color: ${(props) => (props.isError ? "#f48771" : "#d4d4d4")};
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
`;

export interface TerminalOutputProps {
  output: string;
  isError?: boolean;
  className?: string;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  output,
  isError = false,
  className,
}) => {
  return (
    <ResultOutput className={className} isError={isError}>
      {output}
    </ResultOutput>
  );
};
