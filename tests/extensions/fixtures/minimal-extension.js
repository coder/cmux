/**
 * Minimal extension for testing basic functionality
 */

/** @typedef {import('@coder/cmux/ext').Extension} Extension */

/** @type {Extension} */
const extension = {
  onPostToolUse() {
    // Minimal implementation - does nothing
  },
};

export default extension;
