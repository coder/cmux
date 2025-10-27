/**
 * SSH Connection Pool - Stateless
 *
 * Generates deterministic ControlPath from SSH config to enable connection
 * multiplexing across SSHRuntime instances targeting the same host.
 *
 * Design:
 * - Pure function: same config → same controlPath
 * - No state: filesystem is the state
 * - No cleanup: ControlPersist + OS handle it
 */

import * as crypto from "crypto";
import * as path from "path";
import * as os from "os";
import type { SSHRuntimeConfig } from "./SSHRuntime";

/**
 * Get deterministic controlPath for SSH config.
 * Multiple calls with identical config return the same path,
 * enabling ControlMaster to multiplex connections.
 *
 * Socket files are created by SSH and cleaned up automatically:
 * - ControlPersist=60: Removes socket 60s after last use
 * - OS: Cleans /tmp on reboot
 */
export function getControlPath(config: SSHRuntimeConfig): string {
  const key = makeConnectionKey(config);
  const hash = hashKey(key);
  return path.join(os.tmpdir(), `cmux-ssh-${hash}`);
}

/**
 * Generate stable key from config.
 * Identical configs produce identical keys.
 */
function makeConnectionKey(config: SSHRuntimeConfig): string {
  const parts = [
    config.host,
    config.port?.toString() ?? "22",
    config.srcBaseDir,
    config.identityFile ?? "default",
  ];
  return parts.join(":");
}

/**
 * Generate deterministic hash for controlPath naming.
 * Uses first 12 chars of SHA-256 for human-readable uniqueness.
 */
function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").substring(0, 12);
}
