import type { ReactNode } from "react";
import React, { createContext, useContext, useEffect } from "react";
import type { UIMode } from "@/types/mode";
import { usePersistedState } from "@/hooks/usePersistedState";
import { matchesKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { getModeKey } from "@/constants/storage";

type ModeContextType = [UIMode, (mode: UIMode) => void];

const ModeContext = createContext<ModeContextType | undefined>(undefined);

interface ModeProviderProps {
  workspaceId?: string; // Optional - if not provided, uses global key
  children: ReactNode;
}

export const ModeProvider: React.FC<ModeProviderProps> = ({ workspaceId, children }) => {
  // Use workspace-scoped key if workspaceId provided, otherwise use global key
  const modeKey = workspaceId ? getModeKey(workspaceId) : getModeKey("__global__");
  const [mode, setMode] = usePersistedState<UIMode>(modeKey, "exec", {
    listener: true, // Listen for changes from command palette and other sources
  });

  // Set up global keybind handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.TOGGLE_MODE)) {
        e.preventDefault();
        setMode((currentMode) => (currentMode === "plan" ? "exec" : "plan"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMode]);

  const value: ModeContextType = [mode, setMode];

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
};

export const useMode = (): ModeContextType => {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error("useMode must be used within a ModeProvider");
  }
  return context;
};
