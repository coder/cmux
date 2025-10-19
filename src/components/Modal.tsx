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

// Reusable error/warning display components for modals
export const ErrorSection = styled.div`
  margin: 16px 0;
`;

export const ErrorLabel = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

export const ErrorCodeBlock = styled.pre`
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  font-family: var(--font-monospace);
  color: var(--color-text);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
`;

export const WarningBox = styled.div`
  background: var(--color-error-bg);
  border-left: 3px solid var(--color-error);
  border-radius: 4px;
  padding: 12px 16px;
  margin: 16px 0;
`;

export const WarningTitle = styled.div`
  font-weight: 600;
  font-size: 13px;
  color: var(--color-error);
  margin-bottom: 4px;
`;

export const WarningText = styled.div`
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.5;
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

export const DangerButton = styled(Button)`
  background: var(--color-error);
  color: white;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error), #fff 20%);
  }
`;

// Shared form components
export const FormGroup = styled.div`
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

export const ErrorMessage = styled.div`
  color: #ff5555;
  font-size: 13px;
  margin-top: 6px;
`;

export const HelpText = styled.div`
  color: #888;
  font-size: 12px;
  margin-top: 4px;
`;

// Command display components (for showing equivalent slash commands)
export const CommandDisplay = styled.div`
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

export const CommandLabel = styled.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  font-family: system-ui, -apple-system, sans-serif;
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
