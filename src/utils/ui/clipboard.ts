import { useState } from "react";
import { TIMING } from "@/constants/timing";

/**
 * Hook for handling clipboard copy operations with temporary feedback.
 *
 * @param options - Configuration options
 * @param options.duration - How long to show the "copied" state (milliseconds)
 * @param options.writeText - Custom clipboard write function (for testing)
 * @returns Object with `copied` state and `copy` function
 *
 * @example
 * const { copied, copy } = useClipboard();
 * <button onClick={() => copy(text)}>
 *   {copied ? "Copied!" : "Copy"}
 * </button>
 */
export function useClipboard(options?: {
  duration?: number;
  writeText?: (text: string) => Promise<void>;
}) {
  const duration = options?.duration ?? TIMING.COPY_FEEDBACK_DURATION;
  const writeText = options?.writeText ?? ((text: string) => navigator.clipboard.writeText(text));

  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    await writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), duration);
  };

  return { copied, copy };
}
