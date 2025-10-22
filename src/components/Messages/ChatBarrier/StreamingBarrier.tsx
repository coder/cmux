import React from "react";
import { BaseBarrier } from "./BaseBarrier";

interface StreamingBarrierProps {
  className?: string;
  statusText: string; // e.g., "claude-sonnet-4-5 streaming..."
  cancelText: string; // e.g., "hit Esc to cancel"
  tokenCount?: number;
  tps?: number;
}

export const StreamingBarrier: React.FC<StreamingBarrierProps> = ({
  className,
  statusText,
  cancelText,
  tokenCount,
  tps,
}) => {
  return (
    <div className={`flex items-center justify-between gap-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 flex-1">
        <BaseBarrier text={statusText} color="var(--color-assistant-border)" animate />
        {tokenCount !== undefined && (
          <span className="font-mono text-[11px] text-assistant-border select-none whitespace-nowrap">
            ~{tokenCount.toLocaleString()} tokens
            {tps !== undefined && tps > 0 && <span className="text-[#666] ml-1">@ {tps} t/s</span>}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[#888] select-none whitespace-nowrap ml-auto">
        {cancelText}
      </div>
    </div>
  );
};
