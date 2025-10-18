export const BASH_DEFAULT_TIMEOUT_SECS = 3;

// tmpfile policy limits (AI agent - conservative for LLM context)
export const BASH_DEFAULT_MAX_LINES = 300;
export const BASH_HARD_MAX_LINES = 300;
export const BASH_MAX_TOTAL_BYTES = 16 * 1024; // 16KB total output to show agent
export const BASH_MAX_FILE_BYTES = 100 * 1024; // 100KB max to save to temp file

// truncate policy limits (IPC - generous for UI features like code review)
export const BASH_TRUNCATE_HARD_MAX_LINES = 10_000; // 10K lines
export const BASH_TRUNCATE_MAX_TOTAL_BYTES = 1024 * 1024; // 1MB total output

// Shared limits
export const BASH_MAX_LINE_BYTES = 1024; // 1KB per line (shared across both policies)

export const MAX_TODOS = 7; // Maximum number of TODO items in a list
