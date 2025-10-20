export const BASH_DEFAULT_TIMEOUT_SECS = 3;

// tmpfile policy limits (AI agent - conservative for LLM context)
export const BASH_DEFAULT_MAX_LINES = 300;
export const BASH_HARD_MAX_LINES = 300;
export const BASH_MAX_TOTAL_BYTES = 16 * 1024; // 16KB total output to show agent
export const BASH_MAX_FILE_BYTES = 100 * 1024; // 100KB max to save to temp file

// truncate policy limits (IPC - generous for UI features like code review)
// No line limit or per-line byte limit for IPC - only total byte limit applies
export const BASH_TRUNCATE_MAX_TOTAL_BYTES = 1024 * 1024; // 1MB total output
export const BASH_TRUNCATE_MAX_FILE_BYTES = 1024 * 1024; // 1MB file limit (same as total for IPC)

// tmpfile policy limits (AI agent only)
export const BASH_MAX_LINE_BYTES = 1024; // 1KB per line for AI agent

export const MAX_TODOS = 7; // Maximum number of TODO items in a list
