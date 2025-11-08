/**
 * Minimal extension for testing basic functionality
 */

/** @typedef {import('../../../src/types/extensions').Extension} Extension */

/** @type {Extension} */
const extension = {
  onPostToolUse() {
    // Minimal implementation - does nothing
  },
};

export default extension;
