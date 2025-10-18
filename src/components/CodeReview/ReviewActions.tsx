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
  gap: 6px;
  padding: 8px;
  background: #252526;
  border-top: 1px solid #3e3e42;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const ActionButton = styled.button<{ 
  variant: "accept" | "reject" | "clear"; 
  isActive?: boolean;
}>`
  flex: 1;
  padding: 5px 10px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;

  ${(props) => {
    if (props.variant === "accept") {
      return `
        background: ${props.isActive ? "rgba(78, 201, 176, 0.25)" : "transparent"};
        color: #4ec9b0;
        border: 1px solid ${props.isActive ? "#4ec9b0" : "rgba(78, 201, 176, 0.4)"};
        ${props.isActive ? "font-weight: 600;" : ""}
        
        &:hover {
          background: rgba(78, 201, 176, 0.15);
          border-color: #4ec9b0;
        }
      `;
    } else if (props.variant === "reject") {
      return `
        background: ${props.isActive ? "rgba(244, 135, 113, 0.25)" : "transparent"};
        color: #f48771;
        border: 1px solid ${props.isActive ? "#f48771" : "rgba(244, 135, 113, 0.4)"};
        ${props.isActive ? "font-weight: 600;" : ""}
        
        &:hover {
          background: rgba(244, 135, 113, 0.15);
          border-color: #f48771;
        }
      `;
    } else {
      return `
        background: transparent;
        color: #888;
        border: 1px solid #555;
        flex: 0 0 auto;
        
        &:hover {
          background: #444;
          color: #ccc;
        }
      `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusBadge = styled.span<{ status: "accepted" | "rejected" }>`
  display: inline-flex;
  align-items: center;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;

  ${(props) => {
    if (props.status === "accepted") {
      return `
        background: rgba(78, 201, 176, 0.3);
        color: #4ec9b0;
      `;
    } else {
      return `
        background: rgba(244, 135, 113, 0.3);
        color: #f48771;
      `;
    }
  }}
`;

const NoteToggle = styled.button`
  padding: 5px 10px;
  background: transparent;
  border: 1px solid #555;
  border-radius: 3px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);
  flex-shrink: 0;

  &:hover {
    border-color: #007acc;
    color: #ccc;
    background: rgba(0, 122, 204, 0.1);
  }
`;

const NoteInput = styled.textarea`
  width: 100%;
  padding: 6px 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  color: #d4d4d4;
  font-size: 11px;
  font-family: var(--font-monospace);
  resize: vertical;
  min-height: 50px;

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #666;
  }
`;

const KeybindHint = styled.span`
  font-size: 9px;
  color: #666;
  opacity: 0.7;
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
        <ActionButton 
          variant="accept" 
          onClick={handleAccept}
          isActive={currentStatus === "accepted"}
        >
          ✓ Accept
          {currentStatus === "accepted" && <StatusBadge status="accepted">ACCEPTED</StatusBadge>}
          <KeybindHint>(a)</KeybindHint>
        </ActionButton>
        <ActionButton 
          variant="reject" 
          onClick={handleReject}
          isActive={currentStatus === "rejected"}
        >
          ✗ Reject
          {currentStatus === "rejected" && <StatusBadge status="rejected">REJECTED</StatusBadge>}
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

