import type { ReactNode } from "react";
import React, { useState, useMemo } from "react";
import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { HeaderButton } from "../tools/shared/ToolPrimitives";
import { formatTimestamp } from "@/utils/ui/dateTime";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { KebabMenu, type KebabMenuItem } from "../KebabMenu";

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
    <div
      className={className}
      style={{
        position: "relative",
        marginBottom: "15px",
        marginTop: "15px",
        background: backgroundColor ?? "#1e1e1e",
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "3px",
        overflow: "hidden",
      }}
      data-message-block
    >
      {backgroundEffect}
      <div
        className="text-message-header relative z-10 flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium"
        data-message-header
      >
        <div className="flex min-w-0 flex-1 items-baseline gap-3" data-message-header-left>
          <div
            className="inline-flex min-w-0 items-baseline overflow-hidden font-mono tracking-wider whitespace-nowrap uppercase"
            data-message-type-label
          >
            {label}
          </div>
          {formattedTimestamp && (
            <span className="font-mono text-[10px] font-normal opacity-50" data-message-timestamp>
              {formattedTimestamp}
            </span>
          )}
        </div>
        <div className="flex gap-1.5" data-message-header-buttons>
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
        </div>
      </div>
      <div className="relative z-10 p-3" data-message-content>
        {showJson ? (
          <pre className="m-0 overflow-x-auto rounded-sm bg-black/30 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-gray-200">
            {JSON.stringify(message, null, 2)}
          </pre>
        ) : (
          children
        )}
      </div>
    </div>
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
      {button.emoji && isHovered && <span className="mr-1">{button.emoji}</span>}
      {button.label}
    </HeaderButton>
  );
};
