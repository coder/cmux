import type { ReactNode } from "react";
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { CmuxMessage, DisplayedMessage } from "../types/message";
import type { ChatStats } from "../types/chatStats";
import { calculateTokenStats } from "../utils/tokenStatsCalculator";

interface ChatContextType {
  messages: DisplayedMessage[];
  stats: ChatStats | null;
  isCalculating: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
  messages: DisplayedMessage[];
  cmuxMessages: CmuxMessage[];
  model: string;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  messages,
  cmuxMessages,
  model,
}) => {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  // Track if we've already scheduled a calculation to prevent timer spam
  const calculationScheduledRef = useRef(false);

  useEffect(() => {
    if (cmuxMessages.length === 0) {
      setStats({
        consumers: [],
        totalTokens: 0,
        model,
        tokenizerName: "No messages",
        usageHistory: [],
      });
      return;
    }

    // IMPORTANT: Prevent duplicate timers during rapid events (reasoning deltas)
    // During message loading, 600+ reasoning-delta events fire rapidly, each triggering
    // this effect. Without this guard, we'd start 600 timers that all eventually run!
    if (calculationScheduledRef.current) return;

    calculationScheduledRef.current = true;

    // Show calculating state immediately (safe now that aggregator cache provides stable refs)
    setIsCalculating(true);

    // Debounce calculation by 100ms to avoid blocking on rapid updates
    const timeoutId = setTimeout(() => {
      try {
        // Use shared calculator with CmuxMessages (now synchronous with real tokenizer)
        const calculatedStats = calculateTokenStats(cmuxMessages, model);
        setStats(calculatedStats);
      } finally {
        setIsCalculating(false);
        calculationScheduledRef.current = false;
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      calculationScheduledRef.current = false;
    };
  }, [cmuxMessages, model]);

  return (
    <ChatContext.Provider value={{ messages, stats, isCalculating }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};
