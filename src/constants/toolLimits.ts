export const BASH_DEFAULT_TIMEOUT_SECS = 3;
export const BASH_DEFAULT_MAX_LINES = 300;
export const BASH_HARD_MAX_LINES = 300;
export const BASH_MAX_LINE_BYTES = 1024; // 1KB per line
export const BASH_MAX_TOTAL_BYTES = 16 * 1024; // 16KB total output to show agent
export const BASH_MAX_FILE_BYTES = 100 * 1024; // 100KB max to save to temp file

export const FILE_LIST_DEFAULT_DEPTH = 1; // Non-recursive by default
export const FILE_LIST_MAX_DEPTH = 10; // Allow deep traversal when needed
export const FILE_LIST_DEFAULT_MAX_ENTRIES = 100; // Reasonable default
export const FILE_LIST_HARD_MAX_ENTRIES = 128; // Absolute limit (prevent context overload)

export const MAX_TODOS = 7; // Maximum number of TODO items in a list
