import writeFileAtomic from "write-file-atomic";

/**
 * Atomically write data to a file (async).
 * Uses write-file-atomic to ensure the file is never in a half-written state.
 */
export async function writeFileAtomically(filePath: string, data: string): Promise<void> {
  await writeFileAtomic(filePath, data, "utf-8");
}

/**
 * Atomically write data to a file (sync).
 * Uses write-file-atomic to ensure the file is never in a half-written state.
 */
export function writeFileAtomicallySync(filePath: string, data: string): void {
  writeFileAtomic.sync(filePath, data);
}
