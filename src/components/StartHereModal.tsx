import React, { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { Modal, ModalInfo } from "./Modal";

const CountdownContainer = styled.div`
  text-align: center;
  margin: 40px 0;
`;

const CountdownText = styled.div`
  font-size: 64px;
  font-weight: bold;
  color: var(--color-plan-mode);
  font-family: var(--font-monospace);
  line-height: 1;
`;

const CountdownLabel = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: #ccc;
  margin-bottom: 20px;
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

  return (
    <Modal
      isOpen={isOpen}
      title="Start Here"
      subtitle="Press ESC to cancel"
      onClose={handleCancel}
      isLoading={isExecuting}
    >
      <ModalInfo>
        <p>
          This will replace all chat history with this message. This action cannot be undone.
        </p>
      </ModalInfo>

      {!isExecuting && countdown > 0 && (
        <CountdownContainer>
          <CountdownLabel>Compacting in</CountdownLabel>
          <CountdownText>{countdown}</CountdownText>
        </CountdownContainer>
      )}

      {isExecuting && (
        <CountdownContainer>
          <CountdownLabel>Replacing history...</CountdownLabel>
        </CountdownContainer>
      )}
    </Modal>
  );
};
