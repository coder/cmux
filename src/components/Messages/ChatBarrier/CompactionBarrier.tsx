import React from "react";
import { BaseBarrier } from "./BaseBarrier";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

interface CompactionBarrierProps {
  className?: string;
  tokenCount?: number;
  tps?: number;
}

export const CompactionBarrier: React.FC<CompactionBarrierProps> = ({
  className,
  tokenCount,
  tps,
}) => {
  const pieces: string[] = ["compacting..."];

  if (typeof tokenCount === "number") {
    pieces.push(`~${tokenCount.toLocaleString()} tokens`);
  }

  if (typeof tps === "number" && tps > 0) {
    pieces.push(`@ ${tps.toFixed(1)} t/s`);
  }

  const statusText = pieces.join(" ");

  return (
    <BaseBarrier
      text={`${statusText} — hit ${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel`}
      color="var(--color-editing-mode)"
      animate
      className={className}
    />
  );
};
