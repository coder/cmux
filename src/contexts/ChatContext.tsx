import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { CmuxMessage, DisplayedMessage } from "../types/message";
import { ChatStats } from "../types/chatStats";
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

  useEffect(() => {
    let cancelled = false;

    async function calculateStats() {
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

      setIsCalculating(true);

      try {
        // Use shared calculator with CmuxMessages
        const calculatedStats = await calculateTokenStats(cmuxMessages, model);

        if (!cancelled) {
          setStats(calculatedStats);
        }
      } finally {
        if (!cancelled) {
          setIsCalculating(false);
        }
      }
    }

    void calculateStats();

    return () => {
      cancelled = true;
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
