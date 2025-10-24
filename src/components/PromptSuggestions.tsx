import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { PromptSuggestion } from "@/utils/promptSuggestions";

// Export the keys that PromptSuggestions handles
export const PROMPT_SUGGESTION_KEYS = ["Tab", "ArrowUp", "ArrowDown", "Escape"];

// Props interface
interface PromptSuggestionsProps {
  suggestions: PromptSuggestion[];
  onSelectSuggestion: (suggestion: PromptSuggestion) => void;
  onDismiss: () => void;
  isVisible: boolean;
  ariaLabel?: string;
  listId?: string;
}

// Main component
export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  suggestions,
  onSelectSuggestion,
  onDismiss,
  isVisible,
  ariaLabel = "Prompt suggestions",
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
      if (!target.closest("[data-prompt-suggestions]")) {
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
  const resolvedListId = listId ?? `prompt-suggestions-list`;

  return (
    <div
      id={resolvedListId}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={
        activeSuggestion ? `${resolvedListId}-option-${activeSuggestion.id}` : undefined
      }
      data-prompt-suggestions
      className="bg-separator border-border-light absolute right-0 bottom-full left-0 z-[100] mb-2 flex max-h-[200px] flex-col overflow-y-auto rounded border shadow-[0_-4px_12px_rgba(0,0,0,0.4)]"
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
            "px-2.5 py-1.5 cursor-pointer transition-colors duration-150 flex items-center justify-between gap-3 hover:bg-accent-darker",
            index === selectedIndex ? "bg-accent-darker" : "bg-transparent"
          )}
        >
          <div className="text-accent font-monospace shrink-0 text-xs">@{suggestion.name}</div>
          <div
            className={cn(
              "text-medium truncate text-right text-[11px]",
              suggestion.location === "repo" && "text-accent-lighter"
            )}
          >
            {suggestion.location === "repo" ? "📁 repo" : "🏠 system"}
          </div>
        </div>
      ))}
      <div className="border-border-light bg-dark text-placeholder [&_span]:text-medium shrink-0 border-t px-2.5 py-1 text-center text-[10px] [&_span]:font-medium">
        <span>Tab</span> to complete • <span>↑↓</span> to navigate • <span>Esc</span> to dismiss
      </div>
    </div>
  );
};

