/**
 * Jest setup file to ensure Symbol.dispose is available in test environment.
 * Required for explicit resource management (using declarations) to work.
 */

import assert from "assert";

require("disposablestack/auto");

assert.equal(typeof Symbol.dispose, "symbol");
assert.equal(typeof Symbol.asyncDispose, "symbol");
