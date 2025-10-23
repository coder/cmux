import type { ReactNode } from "react";
import React, { useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const toastTypeStyles: Record<"success" | "error", string> = {
  success: "bg-toast-success-bg border border-accent-dark text-toast-success-text",
  error: "bg-toast-error-bg border border-toast-error-border text-toast-error-text",
};

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

export const SolutionLabel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-muted-light text-[10px] mb-1 uppercase">{children}</div>
);

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
  const isRichError = toast.type === "error" && (toast.title ?? toast.solution);

  if (isRichError) {
    return (
      <div className="absolute bottom-full left-[15px] right-[15px] mb-2 z-[1000] pointer-events-none [&>*]:pointer-events-auto">
        <div
          role="alert"
          aria-live="assertive"
          className="bg-toast-fatal-bg border border-toast-fatal-border rounded px-3 py-2.5 text-xs text-danger-soft animate-[toastSlideIn_0.2s_ease-out] shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-sm leading-none">⚠</span>
            <div className="flex-1">
              {toast.title && <div className="font-semibold mb-1.5">{toast.title}</div>}
              <div className="text-light leading-[1.4] mt-1.5">{toast.message}</div>
              {toast.solution && (
                <div className="bg-dark rounded px-2 py-1.5 mt-2 font-monospace text-[11px] text-code-type">
                  {toast.solution}
                </div>
              )}
            </div>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="bg-transparent border-0 text-inherit cursor-pointer p-0 w-4 h-4 flex items-center justify-center text-base leading-none opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Regular toast for simple messages and success
  return (
    <div className="absolute bottom-full left-[15px] right-[15px] mb-2 z-[1000] pointer-events-none [&>*]:pointer-events-auto">
      <div
        role={toast.type === "error" ? "alert" : "status"}
        aria-live={toast.type === "error" ? "assertive" : "polite"}
        className={cn(
          "px-3 py-1.5 rounded text-xs flex items-center gap-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.3)]",
          isLeaving
            ? "animate-[toastFadeOut_0.2s_ease-out_forwards]"
            : "animate-[toastSlideIn_0.2s_ease-out]",
          toastTypeStyles[toast.type]
        )}
      >
        <span className="text-sm leading-none">{toast.type === "success" ? "✓" : "⚠"}</span>
        <div className="flex-1">
          {toast.title && <div className="font-semibold mb-px text-[11px]">{toast.title}</div>}
          <div className="opacity-90">{toast.message}</div>
        </div>
        {toast.type === "error" && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="bg-transparent border-0 text-inherit cursor-pointer p-0 w-4 h-4 flex items-center justify-center text-base leading-none opacity-60 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
