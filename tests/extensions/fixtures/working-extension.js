/**
 * Working extension for error handling tests
 * Proves that one broken extension doesn't break others
 */

/** @typedef {import('../../../src/types/extensions').Extension} Extension */
/** @typedef {import('../../../src/types/extensions').PostToolUseContext} PostToolUseContext */

/** @type {Extension} */
const extension = {
  /**
   * Called after any tool is executed
   * @param {PostToolUseContext} context
   */
  async onPostToolUse(context) {
    const { runtime } = context;
    await runtime.writeFile(
      '.cmux/working-ext-ran.txt',
      'working extension executed'
    );
  },
};

export default extension;
