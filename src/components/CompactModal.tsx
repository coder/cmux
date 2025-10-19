import React, { useEffect, useId, useState } from "react";
import {
  Modal,
  ModalInfo,
  ModalActions,
  CancelButton,
  PrimaryButton,
  FormGroup,
  HelpText,
  CommandDisplay,
  CommandLabel,
} from "./Modal";
import { formatCompactCommand } from "@/utils/chatCommands";

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
