import type { ReactNode } from "react";
<<<<<<< HEAD
import React, { useState, useMemo } from "react";
import styled from "@emotion/styled";
||||||| parent of 16a6df0 (Fix Chromatic compatibility by removing styled shim)
import React, { useState } from "react";
import styled from "@/styles/styled";
=======
import React, { useState } from "react";
import styled from "@emotion/styled";
>>>>>>> 16a6df0 (Fix Chromatic compatibility by removing styled shim)
import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { HeaderButton } from "../tools/shared/ToolPrimitives";
import { formatTimestamp } from "@/utils/ui/dateTime";

const MessageBlock = styled.div<{ borderColor: string; backgroundColor?: string }>`
  margin-bottom: 15px;
  margin-top: 15px;
  background: ${(props) => props.backgroundColor ?? "#1e1e1e"};
  border-left: 3px solid ${(props) => props.borderColor};
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

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MessageTypeLabel = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TimestampText = styled.span`
  font-size: 10px;
  color: var(--color-text-secondary);
  font-weight: 400;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 6px;
`;

const MessageContent = styled.div`
  padding: 12px;
`;

const JsonContent = styled.pre`
  margin: 0;
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 3px;
  overflow-x: auto;
`;

export interface ButtonConfig {
  label: string;
  onClick: () => void;
  active?: boolean;
}

interface MessageWindowProps {
  label: ReactNode;
  borderColor: string;
  backgroundColor?: string;
  message: CmuxMessage | DisplayedMessage;
  buttons?: ButtonConfig[];
  children: ReactNode;
  className?: string;
  rightLabel?: ReactNode;
}

export const MessageWindow: React.FC<MessageWindowProps> = ({
  label,
  borderColor,
  backgroundColor,
  message,
  buttons = [],
  children,
  className,
  rightLabel,
}) => {
  const [showJson, setShowJson] = useState(false);

  // Get timestamp from message if available
  const timestamp =
    "timestamp" in message && typeof message.timestamp === "number" ? message.timestamp : null;

  // Memoize formatted timestamp to avoid recalculating on every render
  const formattedTimestamp = useMemo(
    () => (timestamp ? formatTimestamp(timestamp) : null),
    [timestamp]
  );

  return (
    <MessageBlock borderColor={borderColor} backgroundColor={backgroundColor} className={className}>
      <MessageHeader>
        <LeftSection>
          <MessageTypeLabel>{label}</MessageTypeLabel>
          {formattedTimestamp && <TimestampText>{formattedTimestamp}</TimestampText>}
        </LeftSection>
        <ButtonGroup>
          {rightLabel}
          {buttons.map((button, index) => (
            <HeaderButton key={index} active={button.active} onClick={button.onClick}>
              {button.label}
            </HeaderButton>
          ))}
          <HeaderButton active={showJson} onClick={() => setShowJson(!showJson)}>
            {showJson ? "Hide JSON" : "Show JSON"}
          </HeaderButton>
        </ButtonGroup>
      </MessageHeader>
      <MessageContent>
        {showJson ? <JsonContent>{JSON.stringify(message, null, 2)}</JsonContent> : children}
      </MessageContent>
    </MessageBlock>
  );
};
