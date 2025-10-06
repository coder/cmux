import React from "react";
import { BaseBarrier } from "./BaseBarrier";

interface StreamingBarrierProps {
  className?: string;
}

export const StreamingBarrier: React.FC<StreamingBarrierProps> = ({ className }) => {
  return (
    <BaseBarrier
      text="streaming... hit Esc to cancel"
      color="var(--color-assistant-border)"
      animate
      className={className}
    />
  );
};
