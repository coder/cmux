import React from "react";
import styled from "@emotion/styled";
import type { Keybind } from "@/types/keybinds";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const FKeyBarContainer = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  align-items: center;
  flex-shrink: 0;
  min-height: 28px;
`;

const FKeyButton = styled.button<{ isEmpty: boolean }>`
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  background: ${(props) => (props.isEmpty ? "transparent" : "#37373d")};
  border: 1px solid ${(props) => (props.isEmpty ? "#3e3e42" : "#555")};
  border-radius: 3px;
  color: ${(props) => (props.isEmpty ? "#666" : "#ccc")};
  font-family: var(--font-monospace);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;

  &:hover {
    background: ${(props) => (props.isEmpty ? "#2a2d2e" : "#45454a")};
    border-color: ${(props) => (props.isEmpty ? "#555" : "#666")};
    color: ${(props) => (props.isEmpty ? "#888" : "#fff")};
  }

  &:active {
    background: ${(props) => (props.isEmpty ? "#1e1e1e" : "#505055")};
  }
`;

const KeyLabel = styled.span`
  font-weight: 600;
  margin-right: 6px;
  opacity: 0.8;
`;

const MessagePreview = styled.span`
  opacity: 0.9;
`;

interface FKeyBarProps {
  keybinds: Keybind[];
  onEditKeybind: (key: string, currentMessage?: string) => void;
}

export function FKeyBar({ keybinds, onEditKeybind }: FKeyBarProps) {
  // Create lookup map for quick access
  const keybindMap = new Map(keybinds.map((kb) => [kb.key, kb]));

  // Always show F1-F10 buttons
  const fKeys = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"];

  return (
    <FKeyBarContainer>
      {fKeys.map((key) => {
        const keybind = keybindMap.get(key);
        const message = keybind?.action.type === "send_message" ? keybind.action.message : "";
        const isEmpty = !message;

        return (
          <TooltipWrapper key={key} inline>
            <FKeyButton
              isEmpty={isEmpty}
              onClick={() => onEditKeybind(key, message)}
              title={isEmpty ? `Configure ${key}` : message}
            >
              <KeyLabel>{key}</KeyLabel>
              {!isEmpty && <MessagePreview>{truncateMessage(message, 15)}</MessagePreview>}
            </FKeyButton>
            {!isEmpty && (
              <Tooltip position="bottom" align="center">
                {message}
              </Tooltip>
            )}
          </TooltipWrapper>
        );
      })}
    </FKeyBarContainer>
  );
}

/**
 * Truncate message for preview display
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + "...";
}

