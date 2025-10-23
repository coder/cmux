import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-links",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    return mergeConfig(config, {
      // Inherit project aliases
      resolve: {
        alias: {
          "@": path.join(process.cwd(), "src"),
          // Override version.ts with mock for stable visual testing
          // Use absolute path with $ to ensure exact match
          "@/version$": path.resolve(process.cwd(), ".storybook/mocks/version.ts"),
        },
      },
    });
  },
};

export default config;
