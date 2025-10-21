import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import styled from "@emotion/styled";

const Container = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ModelDisplay = styled.div<{ clickable?: boolean }>`
  font-size: 10px;
  color: #808080;
  font-family: var(--font-monospace);
  line-height: 11px;
  cursor: ${(props) => (props.clickable ? "pointer" : "default")};
  padding: 2px 4px;
  border-radius: 2px;
  transition: background 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(150px, 40vw);
  direction: rtl; /* Right-to-left to show end of text */
  text-align: left; /* Keep visual alignment left */

  &:hover {
    background: ${(props) => (props.clickable ? "#2a2a2b" : "transparent")};
  }
`;

const InputField = styled.input`
  font-size: 10px;
  color: #d4d4d4;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 2px;
  padding: 2px 4px;
  font-family: var(--font-monospace);
  line-height: 11px;
  width: min(200px, 60vw);
  outline: none;

  &:focus {
    border-color: var(--color-exec-mode);
  }
`;

const Dropdown = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: min(300px, 85vw);
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.div<{ highlighted?: boolean }>`
  font-size: 11px;
  color: ${(props) => (props.highlighted ? "#ffffff" : "#d4d4d4")};
  background: ${(props) => (props.highlighted ? "#2a2a2b" : "transparent")};
  font-family: var(--font-monospace);
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: #2a2a2b;
    color: #ffffff;
  }

  &:first-of-type {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  &:last-of-type {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
  }
`;

const ErrorText = styled.div`
  font-size: 9px;
  color: #f48771;
  font-family: var(--font-monospace);
  margin-top: 2px;
`;

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  recentModels: string[];
  onComplete?: () => void;
}

export interface ModelSelectorRef {
  open: () => void;
}

export const ModelSelector = forwardRef<ModelSelectorRef, ModelSelectorProps>(
  ({ value, onChange, recentModels, onComplete }, ref) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value);
    const [error, setError] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownItemRefs = useRef<Array<HTMLDivElement | null>>([]);

    // Update input value when prop changes
    useEffect(() => {
      if (!isEditing) {
        setInputValue(value);
      }
    }, [value, isEditing]);

    // Focus input when editing starts
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    const handleCancel = useCallback(() => {
      setIsEditing(false);
      setInputValue(value);
      setError(null);
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, [value]);

    // Handle click outside to close
    useEffect(() => {
      if (!isEditing) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          handleCancel();
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isEditing, handleCancel]);

    // Filter recent models based on input (show all if empty) and sort lexicographically
    const filteredModels = (
      inputValue.trim() === ""
        ? recentModels
        : recentModels.filter((model) => model.toLowerCase().includes(inputValue.toLowerCase()))
    ).sort();

    const handleSave = () => {
      // If an item is highlighted, use that instead of inputValue
      const valueToSave =
        highlightedIndex >= 0 && highlightedIndex < filteredModels.length
          ? filteredModels[highlightedIndex]
          : inputValue.trim();

      if (!valueToSave) {
        setError("Model cannot be empty");
        return;
      }

      // Basic validation: should have format "provider:model" or be an abbreviation
      if (!valueToSave.includes(":") && valueToSave.length < 3) {
        setError("Invalid model format");
        return;
      }

      onChange(valueToSave);
      setIsEditing(false);
      setError(null);
      setShowDropdown(false);
      setHighlightedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
        // Focus the main ChatInput after selecting a model
        onComplete?.();
      } else if (e.key === "Tab") {
        e.preventDefault();
        // Tab auto-completes the highlighted item without closing
        if (highlightedIndex >= 0 && highlightedIndex < filteredModels.length) {
          setInputValue(filteredModels[highlightedIndex]);
          setHighlightedIndex(-1);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, -1));
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setError(null);

      // Auto-highlight first filtered result
      const filtered =
        newValue.trim() === ""
          ? recentModels
          : recentModels.filter((model) => model.toLowerCase().includes(newValue.toLowerCase()));
      const sortedFiltered = filtered.sort();

      // Highlight first result if any, otherwise no highlight
      setHighlightedIndex(sortedFiltered.length > 0 ? 0 : -1);

      // Keep dropdown visible if there are recent models (filtering happens automatically)
      setShowDropdown(recentModels.length > 0);
    };

    const handleSelectModel = (model: string) => {
      setInputValue(model);
      onChange(model);
      setIsEditing(false);
      setError(null);
      setShowDropdown(false);
    };

    const handleClick = useCallback(() => {
      setIsEditing(true);
      setInputValue(""); // Clear input to show all models
      setShowDropdown(recentModels.length > 0);

      // Start with current value highlighted
      const sortedModels = [...recentModels].sort();
      const currentIndex = sortedModels.indexOf(value);
      setHighlightedIndex(currentIndex);
    }, [recentModels, value]);

    // Expose open method to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        open: handleClick,
      }),
      [handleClick]
    );

    // Scroll highlighted item into view
    useEffect(() => {
      if (highlightedIndex >= 0 && dropdownItemRefs.current[highlightedIndex]) {
        dropdownItemRefs.current[highlightedIndex]?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }, [highlightedIndex]);

    if (!isEditing) {
      return (
        <Container ref={containerRef}>
          <ModelDisplay clickable onClick={handleClick}>
            {value}
          </ModelDisplay>
        </Container>
      );
    }

    return (
      <Container ref={containerRef}>
        <div>
          <InputField
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="provider:model-name"
          />
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        {showDropdown && filteredModels.length > 0 && (
          <Dropdown>
            {filteredModels.map((model, index) => (
              <DropdownItem
                key={model}
                ref={(el) => (dropdownItemRefs.current[index] = el)}
                highlighted={index === highlightedIndex}
                onClick={() => handleSelectModel(model)}
              >
                {model}
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </Container>
    );
  }
);

ModelSelector.displayName = "ModelSelector";
