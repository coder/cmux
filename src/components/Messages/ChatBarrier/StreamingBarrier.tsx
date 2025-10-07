import React from "react";
import { BaseBarrier } from "./BaseBarrier";

interface StreamingBarrierProps {
  className?: string;
  text?: string;
}

export const StreamingBarrier: React.FC<StreamingBarrierProps> = ({
  className,
  text = "streaming... hit Esc to cancel",
}) => {
  return (
    <BaseBarrier text={text} color="var(--color-assistant-border)" animate className={className} />
  );
};
