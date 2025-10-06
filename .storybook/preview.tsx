import type { Preview } from '@storybook/react-vite'
import { themes } from '@storybook/theming';
import { Global, css } from '@emotion/react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { GlobalColors } from '../src/styles/colors';
import { GlobalFonts } from '../src/styles/fonts';
import React from 'react';

// Create emotion cache for consistent styling
const emotionCache = createCache({ key: 'cmux' });

// Base styles matching the app
const globalStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: var(--font-primary);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: var(--color-text);
  }

  code {
    font-family: var(--font-monospace);
  }
`;

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: 'hsl(0 0% 12%)',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    },
    docs: {
      theme: themes.dark,
    },
  },
  decorators: [
    (Story) => (
      <CacheProvider value={emotionCache}>
        <GlobalColors />
        <GlobalFonts />
        <Global styles={globalStyles} />
        <Story />
      </CacheProvider>
    ),
  ],
};

export default preview;