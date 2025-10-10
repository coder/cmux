import { Global, css } from "@emotion/react";

/**
 * Global scrollbar styles for the application
 *
 * These styles provide consistent, attractive scrollbars across all platforms,
 * especially improving the appearance on Linux which uses default browser scrollbars.
 *
 * Uses both webkit-scrollbar (Chrome/Edge/Electron) and the standard scrollbar properties
 * for Firefox support.
 */
export const GlobalScrollbars = () => (
  <Global
    styles={css`
      /* Set dark color scheme to force dark scrollbars on Chromium/Linux */
      :root {
        color-scheme: dark;
      }

      /* Firefox scrollbar styling */
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
      }

      /* Webkit scrollbar styling (Chrome, Edge, Electron) */
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
        background: var(--scrollbar-track);
      }

      ::-webkit-scrollbar-track {
        background: var(--scrollbar-track);
      }

      ::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb);
        border-radius: 5px;
        border: 2px solid var(--scrollbar-track);
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-thumb-hover);
      }

      ::-webkit-scrollbar-corner {
        background: var(--scrollbar-track);
      }
    `}
  />
);
