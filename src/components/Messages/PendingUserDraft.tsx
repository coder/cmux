import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { MessageWindow, type ButtonConfig } from "./MessageWindow";
import type { DisplayedMessage } from "@/types/message";
import { usePersistedState, updatePersistedState } from "@/hooks/usePersistedState";
import { getInputKey } from "@/constants/storage";

const DraftContent = styled.pre`
  margin: 0;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #bbbbbb;
`;

const PendingBadge = styled.span`
  font-size: 10px;
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  padding: 2px 6px;
`;

interface PendingUserDraftProps {
  workspaceId: string;
  onEditDraft?: () => void; // Focuses the ChatInput for editing
}

/**
 * PendingUserDraft - displays the user's queued (unsent) input while compaction is running.
 *
 * Notes:
 * - Reads from the same localStorage key as ChatInput (getInputKey(workspaceId)).
 * - Uses usePersistedState with listener enabled so updates in ChatInput mirror here live.
 * - Offers "Edit" (focus input) and "Discard" (clear draft) actions.
 */
export const PendingUserDraft: React.FC<PendingUserDraftProps> = ({ workspaceId, onEditDraft }) => {
  const [draft] = usePersistedState<string>(getInputKey(workspaceId), "", { listener: true });
  const draftText = (draft ?? "").trim();

  const handleEdit = useCallback(() => {
    onEditDraft?.();
  }, [onEditDraft]);

  const handleDiscard = useCallback(() => {
    updatePersistedState(getInputKey(workspaceId), "");
  }, [workspaceId]);

  if (!draftText) return null;

  const buttons: ButtonConfig[] = [
    { label: "Edit", onClick: handleEdit, tooltip: "Focus input to edit draft" },
    { label: "Discard", onClick: handleDiscard, tooltip: "Clear pending draft" },
  ];

  const displayMessage: DisplayedMessage = {
    type: "user",
    id: "pending-user-draft",
    historyId: "pending-user-draft",
    content: draftText,
    historySequence: -1,
    timestamp: Date.now(),
  };

  return (
    <MessageWindow
      label={
        <>
          PENDING USER <PendingBadge>not sent</PendingBadge>
        </>
      }
      borderColor="var(--color-user-border)"
      backgroundColor="hsl(from var(--color-user-border) h s l / 0.05)"
      message={displayMessage}
      buttons={buttons}
    >
      <DraftContent>{draftText}</DraftContent>
    </MessageWindow>
  );
};
