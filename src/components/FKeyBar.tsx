import React from "react";
import styled from "@emotion/styled";
import type { Keybind } from "@/types/keybinds";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const FKeyBarContainer = styled.div`
  display: flex;
  gap: 3px;
  padding: 4px 6px 2px 6px;
  background: #1e1e1e;
  align-items: center;
  flex-shrink: 0;
`;

const FKeyButton = styled.button<{ isEmpty: boolean }>`
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  background: ${(props) =>
    props.isEmpty
      ? "linear-gradient(180deg, #2d2d30 0%, #252526 100%)"
      : "linear-gradient(180deg, #3e3e42 0%, #2d2d30 100%)"};
  border: 1px solid ${(props) => (props.isEmpty ? "#3e3e42" : "#555")};
  border-bottom: 2px solid ${(props) => (props.isEmpty ? "#1e1e1e" : "#3e3e42")};
  border-radius: 3px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  color: ${(props) => (props.isEmpty ? "#666" : "#ccc")};
  font-family: var(--font-monospace);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.1s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;

  &:hover {
    background: ${(props) =>
      props.isEmpty
        ? "linear-gradient(180deg, #3e3e42 0%, #2d2d30 100%)"
        : "linear-gradient(180deg, #4e4e52 0%, #3e3e42 100%)"};
    border-color: ${(props) => (props.isEmpty ? "#555" : "#666")};
    color: ${(props) => (props.isEmpty ? "#888" : "#fff")};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.5);
    border-bottom-width: 1px;
  }
`;

const KeyLabel = styled.span`
  font-weight: 600;
  margin-right: 4px;
  opacity: 0.9;
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

