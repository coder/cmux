import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";

// Extend window with tip debugging functions
declare global {
  interface Window {
    setTip?: (index: number) => void;
    clearTip?: () => void;
  }
}

const TipsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text);
  font-family: var(--font-primary);
  line-height: 20px;
  margin: 3px 0 0 0;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  cursor: default;

  &:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-plan-mode), transparent 85%) 0%,
      color-mix(in srgb, var(--color-exec-mode), transparent 85%) 50%,
      color-mix(in srgb, var(--color-thinking-mode), transparent 85%) 100%
    );

    .tip-label,
    .tip-content {
      color: var(--color-text);
    }

    .keybind,
    .command {
      color: #fff;
    }
  }
`;

const TipLabel = styled.span`
  font-weight: 500;
  color: color-mix(in srgb, var(--color-text-secondary), transparent 20%);
  transition: color 0.3s ease;
`;

const TipContent = styled.span`
  color: var(--color-text-secondary);
  transition: color 0.3s ease;
`;

const Keybind = styled.span`
  font-family: var(--font-primary);
  color: color-mix(in srgb, var(--color-text), transparent 30%);
  transition: color 0.3s ease;
`;

const Command = styled.code`
  font-family: var(--font-monospace);
  color: color-mix(in srgb, var(--color-text), transparent 30%);
  transition: color 0.3s ease;
`;

const TIPS = [
  {
    content: (
      <>
        Navigate workspaces with{" "}
        <Keybind className="keybind">{formatKeybind(KEYBINDS.PREV_WORKSPACE)}</Keybind> and{" "}
        <Keybind className="keybind">{formatKeybind(KEYBINDS.NEXT_WORKSPACE)}</Keybind>
      </>
    ),
  },
  {
    content: (
      <>
        Use <Command className="command">/truncate 50</Command> to trim the first 50% of the chat
        from context
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
    <TipsContainer>
      <TipLabel className="tip-label">Tip:</TipLabel>
      <TipContent className="tip-content">{TIPS[currentTipIndex]?.content}</TipContent>
    </TipsContainer>
  );
};
