import React, { useState, useEffect } from "react";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

// Extend window with tip debugging functions
declare global {
  interface Window {
    setTip?: (index: number) => void;
    clearTip?: () => void;
  }
}

const TIPS = [
  {
    content: (
      <>
        Navigate workspaces with{" "}
        <span className="keybind font-primary text-[color-mix(in_srgb,var(--color-text),transparent_30%)] transition-colors duration-300">
          {formatKeybind(KEYBINDS.PREV_WORKSPACE)}
        </span>{" "}
        and{" "}
        <span className="keybind font-primary text-[color-mix(in_srgb,var(--color-text),transparent_30%)] transition-colors duration-300">
          {formatKeybind(KEYBINDS.NEXT_WORKSPACE)}
        </span>
      </>
    ),
  },
  {
    content: (
      <>
        Use{" "}
        <code className="command font-monospace text-[color-mix(in_srgb,var(--color-text),transparent_30%)] transition-colors duration-300">
          /truncate 50
        </code>{" "}
        to trim the first 50% of the chat from context
      </>
    ),
  },
];

export const TipsCarousel: React.FC = () => {
  const [manualTipIndex, setManualTipIndex] = useState<number | null>(null);

  // Calculate tip based on hours since epoch
  // This keeps the tips the same for every user and provides variety that we can quickly
  // convey a lot of UX information.
  const calculateTipIndex = (): number => {
    const hoursSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60));
    return hoursSinceEpoch % TIPS.length;
  };

  const currentTipIndex = manualTipIndex ?? calculateTipIndex();

  // Expose setTip to window for debugging
  useEffect(() => {
    window.setTip = (index: number) => {
      if (index >= 0 && index < TIPS.length) {
        setManualTipIndex(index);
      } else {
        console.error(`Invalid tip index. Must be between 0 and ${TIPS.length - 1}`);
      }
    };

    window.clearTip = () => {
      setManualTipIndex(null);
    };

    return () => {
      delete window.setTip;
      delete window.clearTip;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-1.5 text-[11px] text-text font-primary leading-5 mt-[3px] px-2 py-1 rounded transition-all duration-300 cursor-default hover:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-plan-mode),transparent_85%)_0%,color-mix(in_srgb,var(--color-exec-mode),transparent_85%)_50%,color-mix(in_srgb,var(--color-thinking-mode),transparent_85%)_100%)] [&:hover_.tip-label]:text-text [&:hover_.tip-content]:text-text [&:hover_.keybind]:text-white [&:hover_.command]:text-white"
    >
      <span className="tip-label font-medium text-[color-mix(in_srgb,var(--color-text-secondary),transparent_20%)] transition-colors duration-300">
        Tip:
      </span>
      <span className="tip-content text-secondary transition-colors duration-300">
        {TIPS[currentTipIndex]?.content}
      </span>
    </div>
  );
};
