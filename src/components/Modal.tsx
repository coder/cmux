import React, { useEffect, useCallback, useId } from "react";
import styled from "@emotion/styled";
import { matchesKeybind, KEYBINDS } from "@/utils/ui/keybinds";

// Styled Components
export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const ModalContent = styled.div<{ maxWidth?: string; maxHeight?: string }>`
  background: #1e1e1e;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: ${(props) => props.maxWidth ?? "500px"};
  ${(props) => props.maxHeight && `max-height: ${props.maxHeight};`}
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  border: 1px solid #333;

  h2 {
    margin-top: 0;
    margin-bottom: 8px;
    color: #fff;
  }
`;

export const ModalSubtitle = styled.p`
  color: #888;
  font-size: 14px;
  margin-bottom: 20px;
`;

export const ModalInfo = styled.div`
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 20px;
  font-size: 13px;

  p {
    margin: 0 0 8px 0;
    color: #888;

    &:last-child {
      margin-bottom: 0;
    }
  }

  code {
    color: #569cd6;
    font-family: var(--font-monospace);
  }
`;

export const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

export const Button = styled.button`
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const CancelButton = styled(Button)`
  background: #444;
  color: #ccc;

  &:hover:not(:disabled) {
    background: #555;
  }
`;

export const PrimaryButton = styled(Button)`
  background: #007acc;
  color: white;

  &:hover:not(:disabled) {
    background: #005a9e;
  }
`;

// Modal wrapper component
interface ModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  maxHeight?: string;
  isLoading?: boolean;
  describedById?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  subtitle,
  onClose,
  children,
  maxWidth,
  maxHeight,
  isLoading = false,
  describedById,
}) => {
  const headingId = useId();
  const subtitleId = subtitle ? `${headingId}-subtitle` : undefined;
  const ariaDescribedBy = [subtitleId, describedById].filter(Boolean).join(" ") || undefined;

  const handleCancel = useCallback(() => {
    if (!isLoading) {
      onClose();
    }
  }, [isLoading, onClose]);

  // Handle cancel keybind to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.CANCEL) && !isLoading) {
        handleCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, handleCancel]);

  if (!isOpen) return null;

  return (
    <ModalOverlay role="presentation" onClick={handleCancel}>
      <ModalContent
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={ariaDescribedBy}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={headingId}>{title}</h2>
        {subtitle && <ModalSubtitle id={subtitleId}>{subtitle}</ModalSubtitle>}
        {children}
      </ModalContent>
    </ModalOverlay>
  );
};
