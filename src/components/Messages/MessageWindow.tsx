import type { ReactNode } from "react";
import React, { useState, useMemo } from "react";
import styled from "@emotion/styled";
import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { HeaderButton } from "../tools/shared/ToolPrimitives";
import { formatTimestamp } from "@/utils/ui/dateTime";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { KebabMenu, type KebabMenuItem } from "../KebabMenu";

const MessageBlock = styled.div<{ borderColor: string; backgroundColor?: string }>`
  position: relative;
  margin-bottom: 15px;
  margin-top: 15px;
  background: ${(props) => props.backgroundColor ?? "#1e1e1e"};
  border-left: 3px solid ${(props) => props.borderColor};
  border-radius: 3px;
  overflow: hidden;
`;

const MessageHeader = styled.div`
  position: relative;
  z-index: 1;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--color-message-header);
  font-weight: 500;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: baseline; /* Use baseline for consistent text alignment */
  gap: 12px;
  min-width: 0; /* Allow flex children to shrink below content size */
  flex: 1; /* Take available space but allow ButtonGroup to stay on same line */
`;

const MessageTypeLabel = styled.div`
  display: inline-flex;
  align-items: baseline; /* Ensure children align on baseline */
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap; /* Prevent line breaking */
  overflow: hidden; /* Hide overflow */
  min-width: 0; /* Allow shrinking */
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
  position: relative;
  z-index: 1;
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
  disabled?: boolean;
  emoji?: string; // Optional emoji that shows only on hover
  tooltip?: string; // Optional tooltip text
}

interface MessageWindowProps {
  label: ReactNode;
  borderColor: string;
  backgroundColor?: string;
  message: CmuxMessage | DisplayedMessage;
  buttons?: ButtonConfig[];
  kebabMenuItems?: KebabMenuItem[]; // Optional kebab menu items (provide empty array to use kebab with only Show JSON)
  children: ReactNode;
  className?: string;
  rightLabel?: ReactNode;
  backgroundEffect?: ReactNode; // Optional background effect (e.g., animation)
}

export const MessageWindow: React.FC<MessageWindowProps> = ({
  label,
  borderColor,
  backgroundColor,
  message,
  buttons = [],
  kebabMenuItems = [],
  children,
  className,
  rightLabel,
  backgroundEffect,
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
    <MessageBlock
      borderColor={borderColor}
      backgroundColor={backgroundColor}
      className={className}
      data-message-block
    >
      {backgroundEffect}
      <MessageHeader data-message-header>
        <LeftSection data-message-header-left>
          <MessageTypeLabel data-message-type-label>{label}</MessageTypeLabel>
          {formattedTimestamp && (
            <TimestampText data-message-timestamp>{formattedTimestamp}</TimestampText>
          )}
        </LeftSection>
        <ButtonGroup data-message-header-buttons>
          {rightLabel}
          {buttons.map((button, index) =>
            button.tooltip ? (
              <TooltipWrapper key={index} inline>
                <ButtonWithHoverEmoji
                  button={button}
                  active={button.active}
                  disabled={button.disabled}
                />
                <Tooltip align="center">{button.tooltip}</Tooltip>
              </TooltipWrapper>
            ) : (
              <ButtonWithHoverEmoji
                key={index}
                button={button}
                active={button.active}
                disabled={button.disabled}
              />
            )
          )}
          {kebabMenuItems !== undefined ? (
            <KebabMenu
              items={[
                ...kebabMenuItems,
                {
                  label: showJson ? "Hide JSON" : "Show JSON",
                  onClick: () => setShowJson(!showJson),
                },
              ]}
            />
          ) : (
            <HeaderButton active={showJson} onClick={() => setShowJson(!showJson)}>
              {showJson ? "Hide JSON" : "Show JSON"}
            </HeaderButton>
          )}
        </ButtonGroup>
      </MessageHeader>
      <MessageContent data-message-content>
        {showJson ? <JsonContent>{JSON.stringify(message, null, 2)}</JsonContent> : children}
      </MessageContent>
    </MessageBlock>
  );
};

// Button component that shows emoji only on hover
interface ButtonWithHoverEmojiProps {
  button: ButtonConfig;
  active?: boolean;
  disabled?: boolean;
}

const ButtonWithHoverEmoji: React.FC<ButtonWithHoverEmojiProps> = ({
  button,
  active,
  disabled,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <HeaderButton
      active={active}
      onClick={button.onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {button.emoji && isHovered && <span style={{ marginRight: "4px" }}>{button.emoji}</span>}
      {button.label}
    </HeaderButton>
  );
};
