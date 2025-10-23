import React from "react";
import { cn } from "@/lib/utils";

/**
 * HelpIndicator - Small circular help indicator (typically "?")
 * Used with tooltips to show additional information
 */
export const HelpIndicator: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => (
  <span
    className={cn(
      "text-text-dim text-[7px] cursor-help inline-block align-baseline",
      "border border-border-subtle rounded-full w-2.5 h-[10px] leading-[8px]",
      "text-center font-bold mb-[2px]",
      className
    )}
  >
    {children}
  </span>
);
