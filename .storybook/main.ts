import type { StorybookConfig } from '@storybook/react-vite';
import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest"
  ],
  "framework": {
    "name": "@storybook/react-vite",
    "options": {}
  },
  async viteFinal(config: UserConfig) {
    // Remove any existing Vite React plugins that Storybook registers
    config.plugins = (config.plugins || []).filter((plugin) => {
      if (!plugin) return true;
      const pluginName = Array.isArray(plugin) ? plugin[0]?.name : plugin.name;
      return !pluginName?.includes('vite:react');
    });

    // Re-register the React plugin with Emotion configuration
    config.plugins.push(
      react({
        exclude: [/\.stories\.(t|j)sx?$/, /node_modules/],
        jsxImportSource: '@emotion/react',
        babel: {
          plugins: ['@emotion/babel-plugin'],
        },
      })
    );

    // Pre-bundle Emotion packages to reduce cold start time
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include || []),
        '@emotion/react',
        '@emotion/styled',
        '@emotion/cache',
      ],
    };

    return config;
  },
};
export default config;
