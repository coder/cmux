/**
 * Broken extension for error handling tests
 * Throws an error to test graceful degradation
 */

/** @typedef {import('../../../src/types/extensions').Extension} Extension */
/** @typedef {import('../../../src/types/extensions').PostToolUseContext} PostToolUseContext */

/** @type {Extension} */
const extension = {
  /**
   * Called after any tool is executed - intentionally throws
   * @param {PostToolUseContext} context
   */
  async onPostToolUse(context) {
    throw new Error("Intentional test error");
  },
};

export default extension;
