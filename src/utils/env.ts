/**
 * Environment variable parsing utilities
 */

/**
 * Parse environment variable as boolean
 * Accepts: "1", "true", "TRUE", "yes", "YES" as true
 * Everything else (including undefined, "0", "false", "FALSE") as false
 */
export function parseBoolEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
