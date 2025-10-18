import { useState, useEffect, useRef } from "react";

/**
 * Hook to determine layout mode based on container width
 * Returns 'narrow' when container is below threshold, 'wide' otherwise
 * 
 * This replaces unreliable CSS container queries with explicit measurement
 * and React-controlled layout switching.
 */
export function useLayoutMode(threshold: number = 800): {
  layoutMode: "narrow" | "wide";
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const [layoutMode, setLayoutMode] = useState<"narrow" | "wide">("wide");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setLayoutMode(width <= threshold ? "narrow" : "wide");
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  return { layoutMode, containerRef };
}

