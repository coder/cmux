import type { ReactNode } from "react";
import React, { createContext, useContext, useState } from "react";

interface DebugContextType {
  debugMode: boolean;
  setDebugMode: (value: boolean) => void;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export const DebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [debugMode, setDebugMode] = useState(false);

  return (
    <DebugContext.Provider value={{ debugMode, setDebugMode }}>{children}</DebugContext.Provider>
  );
};

export const useDebugMode = () => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebugMode must be used within a DebugProvider");
  }
  return context;
};
