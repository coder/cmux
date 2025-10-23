import React, { useEffect, useCallback, useId } from "react";
import { cn } from "@/lib/utils";
import { matchesKeybind, KEYBINDS } from "@/utils/ui/keybinds";

// Export utility components for backwards compatibility
export const ModalOverlay: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  role?: string;
  className?: string;
}> = ({ children, onClick, role, className }) => (
  <div
    role={role}
    onClick={onClick}
    className={cn("fixed inset-0 bg-black/50 flex justify-center items-center z-[1000]", className)}
  >
    {children}
  </div>
);

export const ModalContent: React.FC<
  {
    children: React.ReactNode;
    maxWidth?: string;
    maxHeight?: string;
    className?: string;
  } & React.HTMLAttributes<HTMLDivElement>
> = ({ children, maxWidth = "500px", maxHeight, className, ...props }) => (
  <div
    className={cn(
      "bg-neutral-950 rounded-lg p-6 w-[90%] flex flex-col shadow-lg border border-neutral-800",
      "[&_h2]:mt-0 [&_h2]:mb-2 [&_h2]:text-white",
      className
    )}
    style={{ maxWidth, ...(maxHeight && { maxHeight }) }}
    {...props}
  >
    {children}
  </div>
);

export const ModalSubtitle: React.FC<{
  children: React.ReactNode;
  id?: string;
  className?: string;
}> = ({ children, id, className }) => (
  <p id={id} className={cn("text-neutral-500 text-sm mb-5", className)}>
    {children}
  </p>
);

export const ModalInfo: React.FC<{
  children: React.ReactNode;
  className?: string;
  id?: string;
}> = ({ children, className, id }) => (
  <div
    id={id}
    className={cn(
      "bg-neutral-900 border border-neutral-700 rounded p-3 mb-5 text-[13px]",
      "[&_p]:m-0 [&_p]:mb-2 [&_p]:text-neutral-500 [&_p:last-child]:mb-0",
      "[&_code]:text-sky-600 [&_code]:font-mono",
      className
    )}
  >
    {children}
  </div>
);

export const ModalActions: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("flex justify-end gap-3 mt-6", className)}>{children}</div>;

// Reusable error/warning display components for modals
export const ErrorSection: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("my-4", className)}>{children}</div>;

export const ErrorLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={cn("text-[11px] text-neutral-200-secondary uppercase tracking-wide mb-2", className)}
  >
    {children}
  </div>
);

export const ErrorCodeBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <pre
    className={cn(
      "bg-neutral-950-secondary border border-neutral-800 rounded p-3",
      "text-xs font-mono text-neutral-200 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed",
      className
    )}
  >
    {children}
  </pre>
);

export const WarningBox: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn("bg-error-bg border-l-[3px] border-error rounded p-3 px-4 my-4", className)}>
    {children}
  </div>
);

export const WarningTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("font-semibold text-[13px] text-error mb-1", className)}>{children}</div>;

export const WarningText: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("text-[13px] text-neutral-200 leading-normal", className)}>{children}</div>;

// Button components
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, className, ...props }) => (
  <button
    className={cn(
      "px-5 py-2 border-none rounded cursor-pointer text-sm font-medium transition-all duration-200",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className
    )}
    {...props}
  >
    {children}
  </button>
);

export const CancelButton: React.FC<ButtonProps> = ({ children, className, ...props }) => (
  <Button
    className={cn(
      "bg-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:hover:bg-neutral-700",
      className
    )}
    {...props}
  >
    {children}
  </Button>
);

export const PrimaryButton: React.FC<ButtonProps> = ({ children, className, ...props }) => (
  <Button
    className={cn("bg-sky-600 text-white hover:bg-sky-700 disabled:hover:bg-sky-600", className)}
    {...props}
  >
    {children}
  </Button>
);

export const DangerButton: React.FC<ButtonProps> = ({ children, className, ...props }) => (
  <Button
    className={cn(
      "bg-error text-white hover:brightness-110 disabled:hover:brightness-100",
      className
    )}
    {...props}
  >
    {children}
  </Button>
);

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
