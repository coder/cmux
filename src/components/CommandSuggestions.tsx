import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
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
    <div
      id={resolvedListId}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={
        activeSuggestion ? `${resolvedListId}-option-${activeSuggestion.id}` : undefined
      }
      data-command-suggestions
      className="absolute bottom-full left-0 right-0 mb-2 bg-separator border border-border-light rounded shadow-[0_-4px_12px_rgba(0,0,0,0.4)] max-h-[200px] overflow-y-auto z-[100] flex flex-col"
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.id}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => onSelectSuggestion(suggestion)}
          id={`${resolvedListId}-option-${suggestion.id}`}
          role="option"
          aria-selected={index === selectedIndex}
          className={cn(
            "px-2.5 py-1.5 cursor-pointer transition-colors duration-150 flex items-center justify-between gap-3 hover:bg-[#094771]",
            index === selectedIndex ? "bg-[#094771]" : "bg-transparent"
          )}
        >
          <div className="text-[#569cd6] font-monospace text-xs flex-shrink-0">
            {suggestion.display}
          </div>
          <div className="text-[#969696] text-[11px] text-right overflow-hidden text-ellipsis whitespace-nowrap">
            {suggestion.description}
          </div>
        </div>
      ))}
      <div className="px-2.5 py-1 border-t border-border-light bg-bg-dark text-[#6b6b6b] text-[10px] text-center flex-shrink-0 [&_span]:text-[#969696] [&_span]:font-medium">
        <span>Tab</span> to complete • <span>↑↓</span> to navigate • <span>Esc</span> to dismiss
      </div>
    </div>
  );
};
