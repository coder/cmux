import { describe } from "@jest/globals";

// gitService.ts exports removeWorktree() and pruneWorktrees() which are used by ipcMain.
// These functions are thin wrappers around git commands and are better tested via
// integration tests that exercise the full Runtime.deleteWorkspace() flow.

describe("gitService", () => {
  // Placeholder describe block to keep test file structure
  // Add unit tests here if needed for removeWorktree() or pruneWorktrees()
});
