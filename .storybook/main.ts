import type { StorybookConfig } from '@storybook/react-vite';
import type { UserConfig } from 'vite';

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
    return {
      ...config,
      plugins: config.plugins,
      optimizeDeps: {
        ...config.optimizeDeps,
        include: [
          ...(config.optimizeDeps?.include || []),
          '@emotion/react',
          '@emotion/styled',
          '@emotion/cache',
        ],
      },
      build: {
        ...config.build,
        commonjsOptions: {
          ...config.build?.commonjsOptions,
          include: [/node_modules/],
        },
      },
    };
  },
};
export default config;