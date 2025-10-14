import type { Preview } from "@storybook/react";
import { GlobalColors } from "../src/styles/colors";
import { GlobalFonts } from "../src/styles/fonts";
import { GlobalScrollbars } from "../src/styles/scrollbars";

const preview: Preview = {
  decorators: [
    (Story) => (
      <>
        <GlobalColors />
        <GlobalFonts />
        <GlobalScrollbars />
        <Story />
      </>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
