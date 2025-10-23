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
          // Mock version module for stable visual testing in Storybook
          "@/version": path.join(process.cwd(), ".storybook/mocks/version.ts"),
        },
      },
    });
  },
};

export default config;
