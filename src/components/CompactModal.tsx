import React, { useEffect, useId, useState } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";
import { formatCompactCommand } from "@/utils/chatCommands";

const FormGroup = styled.div`
  margin-bottom: 20px;

  label {
    display: block;
    margin-bottom: 8px;
    color: #ccc;
    font-size: 14px;
  }

  input,
  select {
    width: 100%;
    padding: 8px 12px;
    background: #2d2d2d;
    border: 1px solid #444;
    border-radius: 4px;
    color: #fff;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: #007acc;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  select {
    cursor: pointer;

    option {
      background: #2d2d2d;
      color: #fff;
    }
  }
`;

const HelpText = styled.div`
  color: #888;
  font-size: 12px;
  margin-top: 4px;
`;

const CommandDisplay = styled.div`
  margin-top: 20px;
  padding: 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  font-family: "Menlo", "Monaco", "Courier New", monospace;
  font-size: 13px;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
`;

const CommandLabel = styled.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
`;

interface CompactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompact: (maxOutputTokens?: number, model?: string) => Promise<void>;
}

const CompactModal: React.FC<CompactModalProps> = ({ isOpen, onClose, onCompact }) => {
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const infoId = useId();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setMaxOutputTokens("");
      setModel("");
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    if (!isLoading) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setIsLoading(true);

    try {
      const tokens = maxOutputTokens.trim() ? parseInt(maxOutputTokens.trim(), 10) : undefined;
      const modelParam = model.trim() || undefined;

      await onCompact(tokens, modelParam);
      setMaxOutputTokens("");
      setModel("");
      onClose();
    } catch (err) {
      console.error("Compact failed:", err);
      // Error handling is done by the parent component
    } finally {
      setIsLoading(false);
    }
  };

  const tokensValue = maxOutputTokens.trim() ? parseInt(maxOutputTokens.trim(), 10) : undefined;
  const modelValue = model.trim() || undefined;

  return (
    <Modal
      isOpen={isOpen}
      title="Compact Conversation"
      subtitle="Summarize conversation history into a compact form"
      onClose={handleCancel}
      isLoading={isLoading}
      describedById={infoId}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <FormGroup>
          <label htmlFor="maxOutputTokens">Max Output Tokens (optional):</label>
          <input
            id="maxOutputTokens"
            type="number"
            value={maxOutputTokens}
            onChange={(event) => setMaxOutputTokens(event.target.value)}
            disabled={isLoading}
            placeholder="e.g., 3000"
            min="100"
          />
          <HelpText>
            Controls the length of the summary. Leave empty for default (~2000 words).
          </HelpText>
        </FormGroup>

        <FormGroup>
          <label htmlFor="model">Model (optional):</label>
          <input
            id="model"
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={isLoading}
            placeholder="e.g., claude-3-5-sonnet-20241022"
          />
          <HelpText>Specify a model for compaction. Leave empty to use current model.</HelpText>
        </FormGroup>

        <ModalInfo id={infoId}>
          <p>
            Compaction will summarize your conversation history, allowing you to continue with a
            shorter context window. The AI will create a compact version that preserves important
            information for future interactions.
          </p>
        </ModalInfo>

        <div>
          <CommandLabel>Equivalent command:</CommandLabel>
          <CommandDisplay>{formatCompactCommand(tokensValue, modelValue)}</CommandDisplay>
        </div>

        <ModalActions>
          <CancelButton type="button" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </CancelButton>
          <PrimaryButton type="submit" disabled={isLoading}>
            {isLoading ? "Compacting..." : "Start Compaction"}
          </PrimaryButton>
        </ModalActions>
      </form>
    </Modal>
  );
};

export default CompactModal;
