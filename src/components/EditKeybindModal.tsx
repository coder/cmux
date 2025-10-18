import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Modal } from "./Modal";

const KeybindModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Label = styled.label`
  font-size: 13px;
  color: #ccc;
  margin-bottom: 6px;
  display: block;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  color: #d4d4d4;
  font-family: var(--font-monospace);
  font-size: 13px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #007acc;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const Button = styled.button<{ variant?: "primary" | "danger" }>`
  padding: 6px 16px;
  border-radius: 3px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;

  ${(props) => {
    if (props.variant === "primary") {
      return `
        background: #007acc;
        color: white;
        &:hover { background: #005a9e; }
        &:disabled {
          background: #555;
          color: #888;
          cursor: not-allowed;
        }
      `;
    } else if (props.variant === "danger") {
      return `
        background: #c72e2e;
        color: white;
        &:hover { background: #a02020; }
      `;
    } else {
      return `
        background: #3e3e42;
        color: #ccc;
        &:hover { background: #505055; }
      `;
    }
  }}
`;

const HintText = styled.div`
  font-size: 12px;
  color: #888;
  line-height: 1.4;
`;

interface EditKeybindModalProps {
  isOpen: boolean;
  fKey: string;
  currentMessage: string;
  onSave: (message: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function EditKeybindModal({
  isOpen,
  fKey,
  currentMessage,
  onSave,
  onClear,
  onClose,
}: EditKeybindModalProps) {
  const [message, setMessage] = useState(currentMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset message when modal opens with new key
  useEffect(() => {
    setMessage(currentMessage);
  }, [currentMessage, isOpen]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave(message.trim());
  };

  const handleClear = () => {
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter / Cmd+Enter to save
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${fKey} Macro`}>
      <KeybindModalContent>
        <div>
          <Label htmlFor="keybind-message">Message to send:</Label>
          <TextArea
            ref={textareaRef}
            id="keybind-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter message (supports slash commands like /edit, /compact, etc.)"
          />
        </div>

        <HintText>
          Tip: You can use slash commands like <code>/edit</code>, <code>/compact</code>, or any
          other message. Press Ctrl+Enter to save.
        </HintText>

        <ButtonRow>
          {currentMessage && (
            <Button variant="danger" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </ButtonRow>
      </KeybindModalContent>
    </Modal>
  );
}

