/**
 * Jest setup file to ensure Symbol.dispose is available in test environment.
 * Required for explicit resource management (using declarations) to work.
 */

import assert from "assert";

require("disposablestack/auto");

assert.equal(typeof Symbol.dispose, "symbol");
assert.equal(typeof Symbol.asyncDispose, "symbol");

// Polyfill File for undici in jest environment
// undici expects File to be available globally but jest doesn't provide it
if (typeof globalThis.File === "undefined") {
  (globalThis as any).File = class File extends Blob {
    constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
      super(bits, options);
      this.name = name;
      this.lastModified = options?.lastModified ?? Date.now();
    }
    name: string;
    lastModified: number;
  };
}
