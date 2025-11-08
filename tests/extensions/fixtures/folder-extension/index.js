/**
 * Folder-based extension for testing
 * Writes a marker file when any tool is used
 */

/** @typedef {import('../../../../src/types/extensions').Extension} Extension */
/** @typedef {import('../../../../src/types/extensions').PostToolUseContext} PostToolUseContext */

/** @type {Extension} */
const extension = {
  /**
   * Called after any tool is executed
   * @param {PostToolUseContext} context
   */
  async onPostToolUse(context) {
    const { runtime } = context;
    await runtime.writeFile(
      '.cmux/folder-ext-ran.txt',
      'folder-based extension executed'
    );
  },
};

export default extension;
