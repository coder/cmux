import React from "react";
import { cn } from "@/lib/utils";

interface BaseBarrierProps {
  text: string;
  color: string;
  animate?: boolean;
  className?: string;
}

export const BaseBarrier: React.FC<BaseBarrierProps> = ({
  text,
  color,
  animate = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2 my-1",
        animate ? "animate-pulse opacity-100" : "opacity-60",
        className
      )}
    >
      <div
        className="flex-1 h-px opacity-30"
        style={{
          background: `linear-gradient(to right, transparent, ${color} 20%, ${color} 80%, transparent)`,
        }}
      />
      <div
        className="font-mono text-[10px] uppercase tracking-wide whitespace-nowrap"
        style={{ color }}
      >
        {text}
      </div>
      <div
        className="flex-1 h-px opacity-30"
        style={{
          background: `linear-gradient(to right, transparent, ${color} 20%, ${color} 80%, transparent)`,
        }}
      />
    </div>
  );
};
