import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";
import type { ThinkingLevel } from "@/types/thinking";
import { usePersistedState } from "@/hooks/usePersistedState";

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
  const [thinkingLevel, setThinkingLevel] = usePersistedState<ThinkingLevel>(
    `thinkingLevel:${workspaceId}`,
    "off"
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
