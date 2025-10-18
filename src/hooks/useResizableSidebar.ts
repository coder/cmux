/**
 * useResizableSidebar - Custom hook for resizable sidebar
 * Handles drag events to resize sidebar width while preserving scroll functionality
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseResizableSidebarOptions {
  enabled: boolean;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
}

interface UseResizableSidebarResult {
  width: number;
  isResizing: boolean;
  startResize: () => void;
  ResizeHandle: React.FC;
}

export function useResizableSidebar({
  enabled,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizableSidebarOptions): UseResizableSidebarResult {
  // Load persisted width from localStorage
  const [width, setWidth] = useState<number>(() => {
    if (!enabled) return defaultWidth;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
    return defaultWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Persist width to localStorage
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(storageKey, width.toString());
    } catch (e) {
      // Ignore storage errors
    }
  }, [width, storageKey, enabled]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate width based on distance from right edge
      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));

      setWidth(newWidth);
    },
    [isResizing, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Attach/detach global mouse listeners during drag
  useEffect(() => {
    if (!isResizing) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Prevent text selection during drag
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const startResize = useCallback(() => {
    if (!enabled) return;
    setIsResizing(true);
    startXRef.current = window.event ? (window.event as MouseEvent).clientX : 0;
    startWidthRef.current = width;
  }, [enabled, width]);

  // Dummy component for type compatibility (actual handle rendered separately)
  const ResizeHandle: React.FC = () => null;

  return {
    width: enabled ? width : defaultWidth,
    isResizing,
    startResize,
    ResizeHandle,
  };
}
