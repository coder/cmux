import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";
import type { ThinkingLevel } from "@/types/thinking";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getThinkingLevelKey } from "@/constants/storage";

interface ThinkingContextType {
  thinkingLevel: ThinkingLevel;
  setThinkingLevel: (level: ThinkingLevel) => void;
}

const ThinkingContext = createContext<ThinkingContextType | undefined>(undefined);

interface ThinkingProviderProps {
  workspaceId: string;
  children: ReactNode;
}

export const ThinkingProvider: React.FC<ThinkingProviderProps> = ({ workspaceId, children }) => {
  const key = getThinkingLevelKey(workspaceId);
  const [thinkingLevel, setThinkingLevel] = usePersistedState<ThinkingLevel>(
    key,
    "off",
    { listener: true } // Listen for changes from command palette and other sources
  );

  return (
    <ThinkingContext.Provider value={{ thinkingLevel, setThinkingLevel }}>
      {children}
    </ThinkingContext.Provider>
  );
};

export const useThinking = () => {
  const context = useContext(ThinkingContext);
  if (!context) {
    throw new Error("useThinking must be used within a ThinkingProvider");
  }
  return context;
};
