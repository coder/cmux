import React from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "@/types/message";

const HiddenIndicator = styled.div`
  margin: 20px 0;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid #569cd6;
  border-radius: 3px;
  color: #888888;
  font-size: 12px;
  font-weight: 400;
  text-align: center;
  font-family: var(--font-primary);
`;

interface HistoryHiddenMessageProps {
  message: DisplayedMessage & { type: "history-hidden" };
  className?: string;
}

export const HistoryHiddenMessage: React.FC<HistoryHiddenMessageProps> = ({
  message,
  className,
}) => {
  return (
    <HiddenIndicator className={className}>
      {message.hiddenCount} older message{message.hiddenCount !== 1 ? "s" : ""} hidden for
      performance
    </HiddenIndicator>
  );
};
