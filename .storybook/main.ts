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
    // Filter out Storybook's default React plugin
    config.plugins = (config.plugins || []).filter((plugin) => {
      return !(
        Array.isArray(plugin) &&
        plugin[0]?.name?.includes('vite:react')
      );
    });

    // Add React plugin with emotion configuration
    config.plugins.push(
      react({
        exclude: [/\.stories\.(t|j)sx?$/, /node_modules/],
        jsxImportSource: '@emotion/react',
        babel: {
          plugins: ['@emotion/babel-plugin'],
        },
      })
    );

    // Optimize emotion dependencies
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