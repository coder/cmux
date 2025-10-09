import type { ReactNode } from "react";
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import type { ChatStats } from "@/types/chatStats";
import { TokenStatsWorker } from "@/utils/tokens/TokenStatsWorker";

interface ChatContextType {
  messages: DisplayedMessage[];
  stats: ChatStats | null;
  isCalculating: boolean;
  workspaceId: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
  messages: DisplayedMessage[];
  cmuxMessages: CmuxMessage[];
  model: string;
  workspaceId: string;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({
  children,
  messages,
  cmuxMessages,
  model,
  workspaceId,
}) => {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  // Track if we've already scheduled a calculation to prevent timer spam
  const calculationScheduledRef = useRef(false);
  // Web Worker for off-thread token calculation
  const workerRef = useRef<TokenStatsWorker | null>(null);

  // Initialize worker once
  useEffect(() => {
    workerRef.current = new TokenStatsWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

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
      // Calculate stats in Web Worker (off main thread)
      workerRef.current
        ?.calculate(cmuxMessages, model)
        .then((calculatedStats) => {
          setStats(calculatedStats);
        })
        .catch((error) => {
          console.error("Failed to calculate token stats:", error);
        })
        .finally(() => {
          setIsCalculating(false);
          calculationScheduledRef.current = false;
        });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      calculationScheduledRef.current = false;
      setIsCalculating(false);
    };
  }, [cmuxMessages, model]);

  return (
    <ChatContext.Provider value={{ messages, stats, isCalculating, workspaceId }}>
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
