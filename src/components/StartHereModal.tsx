import React, { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo, ModalActions, CancelButton, PrimaryButton } from "./Modal";

const CountdownText = styled.div`
  font-size: 48px;
  font-weight: bold;
  text-align: center;
  color: var(--color-plan-mode);
  margin: 20px 0;
  font-family: var(--font-monospace);
`;

const WarningText = styled.p`
  color: #ff9800;
  font-size: 13px;
  margin: 12px 0;
  font-weight: 500;
`;

interface StartHereModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  countdownSeconds?: number;
}

export const StartHereModal: React.FC<StartHereModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  countdownSeconds = 3,
}) => {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isExecuting, setIsExecuting] = useState(false);

  // Reset countdown when modal opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(countdownSeconds);
      setIsExecuting(false);
    }
  }, [isOpen, countdownSeconds]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown <= 0 || isExecuting) return;

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, countdown, isExecuting]);

  // Auto-execute when countdown reaches 0
  useEffect(() => {
    if (!isOpen || countdown > 0 || isExecuting) return;

    const execute = async () => {
      setIsExecuting(true);
      await onConfirm();
      onClose();
    };

    void execute();
  }, [isOpen, countdown, isExecuting, onConfirm, onClose]);

  const handleCancel = useCallback(() => {
    if (!isExecuting) {
      onClose();
    }
  }, [isExecuting, onClose]);

  const handleConfirmNow = useCallback(async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    await onConfirm();
    onClose();
  }, [isExecuting, onConfirm, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      title="Start Here"
      subtitle="This will replace all chat history with this message"
      onClose={handleCancel}
      isLoading={isExecuting}
    >
      <ModalInfo>
        <WarningText>
          ⚠️ This action cannot be undone. All previous messages will be permanently removed from
          history.
        </WarningText>
        <p>
          The current message will become the only message in your conversation history, allowing
          you to start fresh from this point.
        </p>
        <p style={{ marginTop: "12px", color: "#aaa" }}>
          Press <strong>ESC</strong> to cancel
        </p>
      </ModalInfo>

      {!isExecuting && countdown > 0 && <CountdownText>{countdown}</CountdownText>}

      {isExecuting && (
        <CountdownText style={{ fontSize: "18px" }}>Replacing history...</CountdownText>
      )}

      <ModalActions>
        <CancelButton onClick={handleCancel} disabled={isExecuting}>
          Cancel
        </CancelButton>
        <PrimaryButton
          onClick={() => void handleConfirmNow()}
          disabled={isExecuting || countdown === 0}
        >
          {countdown === 0 ? "Executing..." : "Confirm Now"}
        </PrimaryButton>
      </ModalActions>
    </Modal>
  );
};
