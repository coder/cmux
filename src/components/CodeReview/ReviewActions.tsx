/**
 * ReviewActions - Action buttons for accepting/rejecting hunks with optional notes
 */

import React, { useState, useCallback } from "react";
import styled from "@emotion/styled";

interface ReviewActionsProps {
  currentStatus?: "accepted" | "rejected";
  currentNote?: string;
  onAccept: (note?: string) => void;
  onReject: (note?: string) => void;
  onDelete?: () => void;
}

const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #252526;
  border-top: 1px solid #3e3e42;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const ActionButton = styled.button<{ variant: "accept" | "reject" | "clear" }>`
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  ${(props) => {
    if (props.variant === "accept") {
      return `
        background: rgba(78, 201, 176, 0.2);
        color: #4ec9b0;
        border: 1px solid #4ec9b0;
        
        &:hover {
          background: rgba(78, 201, 176, 0.3);
        }
      `;
    } else if (props.variant === "reject") {
      return `
        background: rgba(244, 135, 113, 0.2);
        color: #f48771;
        border: 1px solid #f48771;
        
        &:hover {
          background: rgba(244, 135, 113, 0.3);
        }
      `;
    } else {
      return `
        background: #444;
        color: #ccc;
        border: 1px solid #555;
        flex: 0 0 auto;
        
        &:hover {
          background: #555;
        }
      `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const NoteToggle = styled.button`
  padding: 4px 12px;
  background: transparent;
  border: 1px solid #555;
  border-radius: 4px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  &:hover {
    border-color: #007acc;
    color: #ccc;
  }
`;

const NoteInput = styled.textarea`
  width: 100%;
  padding: 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 12px;
  font-family: var(--font-monospace);
  resize: vertical;
  min-height: 60px;

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #666;
  }
`;

const KeybindHint = styled.span`
  font-size: 10px;
  color: #666;
  margin-left: 4px;
`;

export const ReviewActions: React.FC<ReviewActionsProps> = ({
  currentStatus,
  currentNote,
  onAccept,
  onReject,
  onDelete,
}) => {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState(currentNote ?? "");

  const handleAccept = useCallback(() => {
    onAccept(note || undefined);
    setShowNoteInput(false);
  }, [note, onAccept]);

  const handleReject = useCallback(() => {
    onReject(note || undefined);
    setShowNoteInput(false);
  }, [note, onReject]);

  const handleClear = useCallback(() => {
    onDelete?.();
    setNote("");
    setShowNoteInput(false);
  }, [onDelete]);

  return (
    <ActionsContainer>
      {showNoteInput && (
        <NoteInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)..."
          autoFocus
        />
      )}

      <ButtonRow>
        <ActionButton variant="accept" onClick={handleAccept}>
          ✓ Accept
          <KeybindHint>(a)</KeybindHint>
        </ActionButton>
        <ActionButton variant="reject" onClick={handleReject}>
          ✗ Reject
          <KeybindHint>(r)</KeybindHint>
        </ActionButton>
        {currentStatus && (
          <ActionButton variant="clear" onClick={handleClear}>
            Clear
          </ActionButton>
        )}
        <NoteToggle onClick={() => setShowNoteInput(!showNoteInput)}>
          {showNoteInput ? "Hide" : "Note"} <KeybindHint>(n)</KeybindHint>
        </NoteToggle>
      </ButtonRow>
    </ActionsContainer>
  );
};

