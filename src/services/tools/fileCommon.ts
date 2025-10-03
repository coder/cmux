import * as crypto from "crypto";
import type * as fs from "fs";

/**
 * Secret salt for lease computation, generated once at module load.
 * Never expose this to the agent - it prevents lease guessability.
 */
const LEASE_SECRET = crypto.randomBytes(16);

/**
 * Compute a 6-character hexadecimal lease from file stats.
 * The lease changes when file is modified (mtime or size changes).
 * Uses HMAC-SHA256 with secret salt to prevent guessability.
 *
 * @param stats - File stats from fs.stat()
 * @returns 6-character hexadecimal lease string
 */
export function leaseFromStat(stats: fs.Stats): string {
  // Use highest-precision timestamp available
  const mtime = stats.mtimeMs ?? stats.mtime.getTime();

  // We use size in case mtime is only second precision, which occurs on some
  // dated filesystems.
  const data = `${mtime}:${stats.size}`;

  return crypto.createHmac("sha256", LEASE_SECRET).update(data).digest("hex").slice(0, 6);
}
