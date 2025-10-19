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
import { formatCompactCommand, type CompactOptions } from "@/utils/chatCommands";

interface CompactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompact: (options: CompactOptions) => Promise<void>;
}

const CompactModal: React.FC<CompactModalProps> = ({ isOpen, onClose, onCompact }) => {
  const [options, setOptions] = useState<CompactOptions>({});
  const [maxOutputTokensInput, setMaxOutputTokensInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const infoId = useId();

  // Sync options with input fields
  useEffect(() => {
    setOptions({
      maxOutputTokens: maxOutputTokensInput.trim()
        ? parseInt(maxOutputTokensInput.trim(), 10)
        : undefined,
      model: options.model?.trim() || undefined,
      continueMessage: options.continueMessage?.trim() || undefined,
    });
  }, [maxOutputTokensInput]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setOptions({});
      setMaxOutputTokensInput("");
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
      await onCompact(options);
      setOptions({});
      setMaxOutputTokensInput("");
      onClose();
    } catch (err) {
      console.error("Compact failed:", err);
      // Error handling is done by the parent component
    } finally {
      setIsLoading(false);
    }
  };

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
            value={maxOutputTokensInput}
            onChange={(event) => setMaxOutputTokensInput(event.target.value)}
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
            value={options.model ?? ""}
            onChange={(event) => setOptions({ ...options, model: event.target.value || undefined })}
            disabled={isLoading}
            placeholder="e.g., claude-3-5-sonnet-20241022"
          />
          <HelpText>Specify a model for compaction. Leave empty to use current model.</HelpText>
        </FormGroup>

        <FormGroup>
          <label htmlFor="continueMessage">Continue Message (optional):</label>
          <input
            id="continueMessage"
            type="text"
            value={options.continueMessage ?? ""}
            onChange={(event) =>
              setOptions({ ...options, continueMessage: event.target.value || undefined })
            }
            disabled={isLoading}
            placeholder="Message to send after compaction completes"
          />
          <HelpText>
            If provided, this message will be sent automatically after compaction finishes.
          </HelpText>
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
          <CommandDisplay>{formatCompactCommand(options)}</CommandDisplay>
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
