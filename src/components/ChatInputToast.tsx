import React, { useEffect, useCallback, ReactNode } from "react";
import styled from "@emotion/styled";
import { keyframes, css } from "@emotion/react";

const slideIn = keyframes`
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

interface ToastContainerProps {
  type: "success" | "error";
  isLeaving?: boolean;
}

const ToastContainer = styled.div<ToastContainerProps>`
  padding: 6px 12px;
  margin-bottom: 6px;
  border-radius: 4px;
  font-size: 12px;
  animation: ${slideIn} 0.2s ease-out;
  display: flex;
  align-items: center;
  gap: 6px;

  ${(props) =>
    props.isLeaving &&
    css`
      animation: ${fadeOut} 0.2s ease-out forwards;
    `}

  ${(props) =>
    props.type === "success" &&
    css`
      background: #0e639c20;
      border: 1px solid #0e639c;
      color: #3794ff;
    `}

  ${(props) =>
    props.type === "error" &&
    css`
      background: #f1483620;
      border: 1px solid #f14836;
      color: #f14836;
    `}
`;

const ToastIcon = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const ToastContent = styled.div`
  flex: 1;
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
`;

const ToastTitle = styled.div`
  font-weight: 600;
  margin-bottom: 1px;
  font-size: 11px;
`;

const ToastMessage = styled.div`
  opacity: 0.9;
`;

// Rich error styling from SendMessageError
const ErrorContainer = styled.div`
  background: #2d1f1f;
  border: 1px solid #5a2c2c;
  border-radius: 4px;
  padding: 10px 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #f48771;
  animation: ${slideIn} 0.2s ease-out;
`;

const ErrorDetails = styled.div`
  color: #d4d4d4;
  line-height: 1.4;
  margin-top: 6px;
`;

const ErrorSolution = styled.div`
  background: #1e1e1e;
  border-radius: 3px;
  padding: 6px 8px;
  margin-top: 8px;
  font-family: var(--font-monospace);
  font-size: 11px;
  color: #9cdcfe;
`;

export const SolutionLabel = styled.div`
  color: #808080;
  font-size: 10px;
  margin-bottom: 4px;
  text-transform: uppercase;
`;

export interface Toast {
  id: string;
  type: "success" | "error";
  title?: string;
  message: string;
  solution?: ReactNode;
  duration?: number;
}

interface ChatInputToastProps {
  toast: Toast | null;
  onDismiss: () => void;
}

export const ChatInputToast: React.FC<ChatInputToastProps> = ({ toast, onDismiss }) => {
  const [isLeaving, setIsLeaving] = React.useState(false);

  const handleDismiss = useCallback(() => {
    setIsLeaving(true);
    setTimeout(onDismiss, 200); // Wait for fade animation
  }, [onDismiss]);

  useEffect(() => {
    if (!toast) return;

    // Only auto-dismiss success toasts
    if (toast.type === "success") {
      const duration = toast.duration ?? 3000;
      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => {
        clearTimeout(timer);
      };
    }

    // Error toasts stay until manually dismissed
    return () => {
      setIsLeaving(false);
    };
  }, [toast, handleDismiss]);

  if (!toast) return null;

  // Use rich error style when there's a title or solution
  const isRichError = toast.type === "error" && (toast.title || toast.solution);

  if (isRichError) {
    return (
      <ErrorContainer>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
          <ToastIcon>⚠</ToastIcon>
          <div style={{ flex: 1 }}>
            {toast.title && (
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>{toast.title}</div>
            )}
            <ErrorDetails>{toast.message}</ErrorDetails>
            {toast.solution && <ErrorSolution>{toast.solution}</ErrorSolution>}
          </div>
          <CloseButton onClick={handleDismiss}>×</CloseButton>
        </div>
      </ErrorContainer>
    );
  }

  // Regular toast for simple messages and success
  return (
    <ToastContainer type={toast.type} isLeaving={isLeaving}>
      <ToastIcon>{toast.type === "success" ? "✓" : "⚠"}</ToastIcon>
      <ToastContent>
        {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
        <ToastMessage>{toast.message}</ToastMessage>
      </ToastContent>
      {toast.type === "error" && (
        <CloseButton onClick={handleDismiss} aria-label="Dismiss">
          ×
        </CloseButton>
      )}
    </ToastContainer>
  );
};
