import { Global, css } from '@emotion/react';

/**
 * Global color definitions for the application
 * 
 * COLOR GUIDELINES:
 * - Primary colors should be defined using HSL notation for easy manipulation
 * - Variants (hover, light, alpha) should use CSS color modification functions
 *   like color-mix(), hsl() with alpha, or calc() on the primary color
 * - This approach ensures consistency and makes theme changes easier
 */
export const GlobalColors = () => (
  <Global
    styles={css`
      :root {
        /* Plan Mode Colors */
        --color-plan-mode: hsl(210 70% 40%);
        --color-plan-mode-hover: color-mix(in srgb, var(--color-plan-mode), white 20%);
        --color-plan-mode-light: color-mix(in srgb, var(--color-plan-mode) 60%, white);
        --color-plan-mode-alpha: hsl(from var(--color-plan-mode) h s l / 0.1);
        --color-plan-mode-alpha-hover: hsl(from var(--color-plan-mode) h s l / 0.15);
        
        /* Edit Mode Colors */
        --color-edit-mode: hsl(120 50% 35%);
        --color-edit-mode-hover: color-mix(in srgb, var(--color-edit-mode), white 20%);
        --color-edit-mode-light: color-mix(in srgb, var(--color-edit-mode) 60%, white);
        --color-edit-mode-alpha: hsl(from var(--color-edit-mode) h s l / 0.1);
        --color-edit-mode-alpha-hover: hsl(from var(--color-edit-mode) h s l / 0.15);
        
        /* YOLO Mode Colors */
        --color-yolo-mode: hsl(0 70% 45%);
        --color-yolo-mode-hover: color-mix(in srgb, var(--color-yolo-mode), white 20%);
        --color-yolo-mode-light: color-mix(in srgb, var(--color-yolo-mode) 60%, white);
        --color-yolo-mode-alpha: hsl(from var(--color-yolo-mode) h s l / 0.1);
        --color-yolo-mode-alpha-hover: hsl(from var(--color-yolo-mode) h s l / 0.15);
        
        /* Debug Mode Colors */
        --color-debug: hsl(214 100% 64%);
        --color-debug-light: color-mix(in srgb, var(--color-debug), white 20%);
        --color-debug-alpha: hsl(from var(--color-debug) h s l / 0.1);
        --color-debug-text: color-mix(in srgb, var(--color-debug), white 30%);
        
        /* Background & Layout Colors */
        --color-background: hsl(0 0% 12%);
        --color-background-secondary: hsl(60 1% 15%);
        --color-border: hsl(240 2% 25%);
        --color-text: hsl(0 0% 83%);
        --color-text-secondary: hsl(0 0% 42%);
        
        /* Button Colors */
        --color-button-bg: hsl(0 0% 24%);
        --color-button-text: hsl(0 0% 80%);
        --color-button-hover-bg: color-mix(in srgb, var(--color-button-bg), white 10%);
        
        /* User Message Colors */
        --color-user-border: hsl(0 0% 38%);
        --color-user-border-hover: color-mix(in srgb, var(--color-user-border), white 10%);
      }
    `}
  />
);