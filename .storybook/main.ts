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
    // Force Babel to process all files (not just JSX) to ensure emotion transforms work
    config.plugins.push(
      react({
        include: '**/*.{jsx,tsx,ts,js}',
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

    // Ensure emotion packages are resolved correctly
    config.resolve = {
      ...config.resolve,
      dedupe: ['@emotion/react', '@emotion/styled', '@emotion/cache'],
    };

    return config;
  },
};
export default config;