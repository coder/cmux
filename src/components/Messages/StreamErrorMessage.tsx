import React from "react";
import type { DisplayedMessage } from "@/types/message";
import { cn } from "@/lib/utils";

interface StreamErrorMessageProps {
  message: DisplayedMessage & { type: "stream-error" };
  className?: string;
}

// Note: RetryBarrier now handles all retry UI. This component just displays the error.
export const StreamErrorMessage: React.FC<StreamErrorMessageProps> = ({ message, className }) => {
  const showCount = message.errorCount !== undefined && message.errorCount > 1;

  return (
    <div className={cn("bg-error-bg border border-error rounded px-5 py-4 my-3", className)}>
      <div className="font-primary text-[13px] font-semibold text-error mb-3 flex items-center gap-2.5 tracking-wide">
        <span className="text-base leading-none">●</span>
        <span>Stream Error</span>
        <span className="font-mono text-[10px] text-text-secondary uppercase bg-black/40 px-2 py-0.5 rounded-sm tracking-wider">
          {message.errorType}
        </span>
        {showCount && (
          <span className="font-mono text-[10px] text-error bg-red-500/15 px-2 py-0.5 rounded-sm tracking-wide font-semibold ml-auto">
            ×{message.errorCount}
          </span>
        )}
      </div>
      <div className="font-mono text-[13px] text-foreground leading-relaxed break-words">
        {message.error}
      </div>
    </div>
  );
};
