import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import type { SlashSuggestion } from "@/utils/slashCommands/types";

// Export the keys that CommandSuggestions handles
export const COMMAND_SUGGESTION_KEYS = ["Tab", "ArrowUp", "ArrowDown", "Escape"];

// Props interface
interface CommandSuggestionsProps {
  suggestions: SlashSuggestion[];
  onSelectSuggestion: (suggestion: SlashSuggestion) => void;
  onDismiss: () => void;
  isVisible: boolean;
  ariaLabel?: string;
  listId?: string;
}

// Styled components
const PopoverContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 8px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  display: flex;
  flex-direction: column;
`;

const CommandItem = styled.div<{ selected: boolean }>`
  padding: 6px 10px;
  cursor: pointer;
  background: ${(props) => (props.selected ? "#094771" : "transparent")};
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &:hover {
    background: #094771;
  }
`;

const CommandText = styled.div`
  color: #569cd6;
  font-family: var(--font-monospace);
  font-size: 12px;
  flex-shrink: 0;
`;

const CommandDescription = styled.div`
  color: #969696;
  font-size: 11px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const HelperText = styled.div`
  padding: 4px 10px;
  border-top: 1px solid #3e3e42;
  background: #1e1e1e;
  color: #6b6b6b;
  font-size: 10px;
  text-align: center;
  flex-shrink: 0;

  span {
    color: #969696;
    font-weight: 500;
  }
`;

// Main component
export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  suggestions,
  onSelectSuggestion,
  onDismiss,
  isVisible,
  ariaLabel = "Command suggestions",
  listId,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection whenever suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible || suggestions.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % suggestions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          break;
        case "Tab":
          if (!e.shiftKey && suggestions.length > 0) {
            e.preventDefault();
            onSelectSuggestion(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, suggestions, selectedIndex, onSelectSuggestion, onDismiss]);

  // Click outside handler
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-command-suggestions]")) {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVisible, onDismiss]);

  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  const activeSuggestion = suggestions[selectedIndex] ?? suggestions[0];
  const resolvedListId = listId ?? `command-suggestions-list`;

  return (
    <PopoverContainer
      id={resolvedListId}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={
        activeSuggestion ? `${resolvedListId}-option-${activeSuggestion.id}` : undefined
      }
      data-command-suggestions
    >
      {suggestions.map((suggestion, index) => (
        <CommandItem
          key={suggestion.id}
          selected={index === selectedIndex}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => onSelectSuggestion(suggestion)}
          id={`${resolvedListId}-option-${suggestion.id}`}
          role="option"
          aria-selected={index === selectedIndex}
        >
          <CommandText>{suggestion.display}</CommandText>
          <CommandDescription>{suggestion.description}</CommandDescription>
        </CommandItem>
      ))}
      <HelperText>
        <span>Tab</span> to complete • <span>↑↓</span> to navigate • <span>Esc</span> to dismiss
      </HelperText>
    </PopoverContainer>
  );
};
