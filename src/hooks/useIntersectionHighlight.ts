import { useEffect, useRef, useState } from "react";

/**
 * Hook for lazy-loading expensive async operations using IntersectionObserver
 *
 * Defers execution of `highlightFn` until the element enters the viewport,
 * improving performance by avoiding work for off-screen content.
 *
 * @example
 * const { result, ref } = useIntersectionHighlight(
 *   async () => await expensiveOperation(),
 *   [dependency]
 * );
 * return <div ref={ref}>{result ?? fallback}</div>;
 */
export function useIntersectionHighlight<T>(
  highlightFn: () => Promise<T>,
  deps: React.DependencyList
): { result: T | null; ref: React.RefObject<HTMLDivElement> } {
  const [result, setResult] = useState<T | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasHighlightedRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Reset if dependencies change
    hasHighlightedRef.current = false;
    setResult(null);

    // Check if IntersectionObserver is supported (fallback for older browsers)
    if (typeof IntersectionObserver === "undefined") {
      void highlightFn().then((value) => {
        setResult(value);
        hasHighlightedRef.current = true;
      });
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasHighlightedRef.current) {
          hasHighlightedRef.current = true;

          void highlightFn()
            .then((value) => {
              setResult(value);
            })
            .catch((error) => {
              console.warn("Intersection highlight failed:", error);
            });

          // Disconnect after first highlight - no need to observe anymore
          observer.disconnect();
        }
      },
      {
        // Start loading slightly before element enters viewport for smooth UX
        rootMargin: "200px",
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { result, ref };
}

