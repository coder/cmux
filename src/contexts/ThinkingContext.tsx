import React, { createContext, useContext, useState, ReactNode } from "react";
import { ThinkingLevel } from "../types/thinking";

interface ThinkingContextType {
  thinkingLevel: ThinkingLevel;
  setThinkingLevel: (level: ThinkingLevel) => void;
}

const ThinkingContext = createContext<ThinkingContextType | undefined>(undefined);

export const ThinkingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");

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
