/**
 * Centralized timing constants for animations, transitions, and delays.
 * All values are in milliseconds.
 */
export const TIMING = {
  /** Duration to show "Copied!" feedback after clipboard operations */
  COPY_FEEDBACK_DURATION: 2000,

  /** Delay before hiding tooltip after mouse leaves trigger */
  TOOLTIP_HIDE_DELAY: 300,

  /** Delay when mouse leaves tooltip content area */
  TOOLTIP_LEAVE_DELAY: 100,

  /** Duration for modal animation transitions */
  MODAL_ANIMATION_DELAY: 200,

  /** Debounce delay for search inputs */
  SEARCH_DEBOUNCE: 300,

  /** Standard animation duration for UI transitions */
  ANIMATION_STANDARD: 150,

  /** Fast animation duration */
  ANIMATION_FAST: 100,

  /** Slow animation duration */
  ANIMATION_SLOW: 300,
} as const;
