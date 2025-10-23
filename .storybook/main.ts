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
          // Mock version module for stable visual testing in Storybook
          // MUST be before @ alias to take precedence
          "@/version": path.join(process.cwd(), ".storybook/mocks/version.ts"),
          "@": path.join(process.cwd(), "src"),
        },
      },
    });
  },
};

export default config;
