import { Global, css } from "@emotion/react";

/**
 * Global color definitions for the application
 *
 * COLOR GUIDELINES:
 * - Primary colors should be defined using HSL notation for easy manipulation
 * - Minimize number of primary colors, prefer variants and reuse for similar concepts
 * - Variants (hover, light, alpha) should use CSS color modification functions
 *   like color-mix(), hsl() with alpha, or calc() on the primary color
 * - This approach ensures consistency and makes theme changes easier
 * - All colors should be defined in this file, not spread throughout the codebase
 */
export const GlobalColors = () => (
  <Global
    styles={css`
      :root {
        /* Plan Mode Colors (Blue) */
        --color-plan-mode: hsl(210 70% 40%);
        --color-plan-mode-rgb: 31, 107, 184; /* RGB equivalent for alpha blending */
        --color-plan-mode-hover: color-mix(in srgb, var(--color-plan-mode), white 20%);
        --color-plan-mode-light: color-mix(in srgb, var(--color-plan-mode) 60%, white);
        --color-plan-mode-alpha: hsl(from var(--color-plan-mode) h s l / 0.1);
        --color-plan-mode-alpha-hover: hsl(from var(--color-plan-mode) h s l / 0.15);

        /* Exec Mode Colors (Purple) */
        --color-exec-mode: hsl(268.56deg 94.04% 55.19%);
        --color-exec-mode-hover: color-mix(in srgb, var(--color-exec-mode), white 20%);
        --color-exec-mode-light: color-mix(in srgb, var(--color-exec-mode) 60%, white);
        --color-exec-mode-alpha: hsl(from var(--color-exec-mode) h s l / 0.1);
        --color-exec-mode-alpha-hover: hsl(from var(--color-exec-mode) h s l / 0.15);

        /* Edit Mode Colors (Green - for editing messages) */
        --color-edit-mode: hsl(120 50% 35%);
        --color-edit-mode-hover: color-mix(in srgb, var(--color-edit-mode), white 20%);
        --color-edit-mode-light: color-mix(in srgb, var(--color-edit-mode) 60%, white);
        --color-edit-mode-alpha: hsl(from var(--color-edit-mode) h s l / 0.1);
        --color-edit-mode-alpha-hover: hsl(from var(--color-edit-mode) h s l / 0.15);

        /* Read State Colors (Blue - reuses plan mode color for consistency) */
        --color-read: var(--color-plan-mode);
        --color-read-alpha: var(--color-plan-mode-alpha);

        /* Editing Mode Colors */
        --color-editing-mode: hsl(30 100% 50%);
        --color-editing-mode-alpha: hsl(from var(--color-editing-mode) h s l / 0.1);

        /* Pending Colors */
        --color-pending: color-mix(in srgb, var(--color-editing-mode), white 40%);

        /* Debug Mode Colors */
        --color-debug: hsl(214 100% 64%);
        --color-debug-light: color-mix(in srgb, var(--color-debug), white 20%);
        --color-debug-alpha: hsl(from var(--color-debug) h s l / 0.1);
        --color-debug-text: color-mix(in srgb, var(--color-debug), white 30%);

        /* Thinking Mode Colors */
        --color-thinking-mode: hsl(271 76% 53%); /* BlueViolet purple */
        --color-thinking-mode-light: color-mix(in srgb, var(--color-thinking-mode), white 20%);
        --color-thinking-mode-alpha: hsl(from var(--color-thinking-mode) h s l / 0.1);
        --color-thinking-border: var(--color-thinking-mode);

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

        /* Assistant Message Colors */
        --color-assistant-border: hsl(207 45% 40%);
        --color-assistant-border-hover: color-mix(
          in srgb,
          var(--color-assistant-border),
          white 15%
        );

        /* Message Header Colors */
        --color-message-header: hsl(0 0% 80%);

        /* Token Usage Colors */
        --color-token-prompt: hsl(0 0% 40%);
        --color-token-completion: linear-gradient(
          90deg,
          hsl(207 100% 40%) 0%,
          hsl(207 100% 31%) 100%
        );
        --color-token-variable: linear-gradient(
          90deg,
          hsl(207 100% 40%) 0%,
          hsl(207 100% 31%) 100%
        );
        --color-token-fixed: hsl(0 0% 40%);
        --color-token-input: hsl(120 40% 35%);
        --color-token-output: hsl(207 100% 40%);
        --color-token-cached: hsl(0 0% 50%);

        /* Toggle Group Colors */
        --color-toggle-bg: hsl(0 0% 16.5%);
        --color-toggle-active: hsl(0 0% 22.7%);
        --color-toggle-hover: hsl(0 0% 17.6%);
        --color-toggle-text: hsl(0 0% 53.3%);
        --color-toggle-text-active: hsl(0 0% 100%);
        --color-toggle-text-hover: hsl(0 0% 66.7%);

        /* Interrupted/Warning Colors */
        --color-interrupted: hsl(38 92% 50%); /* #f59e0b */
        --color-interrupted-alpha: hsl(from var(--color-interrupted) h s l / 0.3);

        /* Git Dirty/Uncommitted Changes Colors */
        --color-git-dirty: hsl(38 92% 50%); /* Same as interrupted - orange warning color */

        /* Error Colors */
        --color-error: hsl(0 70% 50%); /* Red for errors */
        --color-error-alpha: hsl(from var(--color-error) h s l / 0.1);
        --color-error-bg: hsl(0 32% 18%); /* Dark red background for error messages */

        /* Input Colors */
        --color-input-bg: hsl(0 0% 12%);
        --color-input-text: hsl(0 0% 80%);
        --color-input-border: hsl(207 51% 59%); /* VS Code blue */
        --color-input-border-focus: hsl(193 91% 64%); /* Lighter blue on focus */

        /* Scrollbar Colors */
        --scrollbar-track: hsl(0 0% 18%);
        --scrollbar-thumb: hsl(0 0% 32%);
        --scrollbar-thumb-hover: hsl(0 0% 42%);
      }
    `}
  />
);
