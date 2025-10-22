import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        // Mode colors
        "plan-mode": "hsl(var(--plan-mode))",
        "plan-mode-hover": "hsl(var(--plan-mode-hover))",
        "plan-mode-light": "hsl(var(--plan-mode-light))",
        "exec-mode": "hsl(var(--exec-mode))",
        "exec-mode-hover": "hsl(var(--exec-mode-hover))",
        "exec-mode-light": "hsl(var(--exec-mode-light))",
        "edit-mode": "hsl(var(--edit-mode))",
        "edit-mode-hover": "hsl(var(--edit-mode-hover))",
        "edit-mode-light": "hsl(var(--edit-mode-light))",
        "editing-mode": "hsl(var(--editing-mode))",
        "debug-mode": "hsl(var(--debug-mode))",
        "debug-light": "hsl(var(--debug-light))",
        "debug-text": "hsl(var(--debug-text))",
        "thinking-mode": "hsl(var(--thinking-mode))",
        "thinking-mode-light": "hsl(var(--thinking-mode-light))",
        "thinking-border": "hsl(var(--thinking-border))",
        
        // Layout colors
        background: "hsl(var(--background))",
        "background-secondary": "hsl(var(--background-secondary))",
        border: "hsl(var(--border))",
        foreground: "hsl(var(--foreground))",
        "foreground-secondary": "hsl(var(--foreground-secondary))",
        
        // Code colors
        "code-bg": "hsl(var(--code-bg))",
        
        // Button colors
        "button-bg": "hsl(var(--button-bg))",
        "button-text": "hsl(var(--button-text))",
        "button-hover": "hsl(var(--button-hover))",
        
        // Message colors
        "user-border": "hsl(var(--user-border))",
        "user-border-hover": "hsl(var(--user-border-hover))",
        "assistant-border": "hsl(var(--assistant-border))",
        "assistant-border-hover": "hsl(var(--assistant-border-hover))",
        "message-header": "hsl(var(--message-header))",
        
        // Token colors
        "token-prompt": "hsl(var(--token-prompt))",
        "token-completion": "hsl(var(--token-completion))",
        "token-variable": "hsl(var(--token-variable))",
        "token-fixed": "hsl(var(--token-fixed))",
        "token-input": "hsl(var(--token-input))",
        "token-output": "hsl(var(--token-output))",
        "token-cached": "hsl(var(--token-cached))",
        
        // Toggle colors
        "toggle-bg": "hsl(var(--toggle-bg))",
        "toggle-active": "hsl(var(--toggle-active))",
        "toggle-hover": "hsl(var(--toggle-hover))",
        "toggle-text": "hsl(var(--toggle-text))",
        "toggle-text-active": "hsl(var(--toggle-text-active))",
        "toggle-text-hover": "hsl(var(--toggle-text-hover))",
        
        // Status colors
        interrupted: "hsl(var(--interrupted))",
        "review-accent": "hsl(var(--review-accent))",
        "git-dirty": "hsl(var(--git-dirty))",
        error: "hsl(var(--error))",
        "error-bg": "hsl(var(--error-bg))",
        pending: "hsl(var(--pending))",
        
        // Input colors
        "input-bg": "hsl(var(--input-bg))",
        "input-text": "hsl(var(--input-text))",
        "input-border": "hsl(var(--input-border))",
        "input-border-focus": "hsl(var(--input-border-focus))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      fontFamily: {
        primary: ["IBM Plex Sans", "sans-serif"],
        sans: ["IBM Plex Sans", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "Monaco", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

