import * as path from "path";
import { spawnSync } from "child_process";

/**
 * Resolve a usable bash path on the current platform.
 * - On POSIX (darwin/linux): returns "bash"
 * - On Windows: tries env override, PATH, and common Git install paths.
 *
 * You can override detection by setting GIT_BASH_PATH to an absolute path to bash.exe.
 */
export function resolveBashPath(): string {
  if (process.platform !== "win32") {
    return "bash";
  }

  // Allow explicit override
  const fromEnv = process.env.GIT_BASH_PATH;
  if (fromEnv) {
    return fromEnv;
  }

  // Try PATH search for bash.exe using `where`
  const fromPath = findOnPath("bash.exe");
  if (fromPath) {
    return fromPath;
  }

  // Try common Git for Windows install locations
  const candidates = compact([
    // Newer Git for Windows default
    joinIfExists(process.env.ProgramFiles, "Git", "bin", "bash.exe"),
    joinIfExists(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
    joinIfExists(process.env.LocalAppData, "Programs", "Git", "bin", "bash.exe"),
    // Alternate locations within Git
    joinIfExists(process.env.ProgramFiles, "Git", "usr", "bin", "bash.exe"),
    joinIfExists(process.env["ProgramFiles(x86)"], "Git", "usr", "bin", "bash.exe"),
    joinIfExists(process.env.LocalAppData, "Programs", "Git", "usr", "bin", "bash.exe"),
    // Scoop / Chocolatey common install patterns (best-effort)
    "C:\\ProgramData\\scoop\\apps\\git\\current\\bin\\bash.exe",
    "C:\\ProgramData\\chocolatey\\lib\\git.install\\tools\\bin\\bash.exe",
  ]);

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  // Not found; return a sentinel that will cause a clear error when spawned
  // Callers should catch ENOENT and surface an actionable message.
  return "bash"; // preserve existing behavior; spawn() will error with ENOENT
}

export function buildBashSpawn(
  niceness: number | undefined,
  script: string
): {
  command: string;
  args: string[];
} {
  const bashPath = resolveBashPath();
  const isWindows = process.platform === "win32";

  // niceness only applies on POSIX; ignore on Windows
  const useNice = niceness !== undefined && !isWindows;
  const command = useNice ? "nice" : bashPath;
  const args = useNice ? ["-n", String(niceness), bashPath, "-c", script] : ["-c", script];

  return { command, args };
}

/**
 * Attempt to find an executable on PATH (Windows).
 */
function findOnPath(exeName: string): string | null {
  try {
    const res = spawnSync("where", [exeName], { encoding: "utf8", windowsHide: true });
    if (res.status !== 0 || !res.stdout) return null;
    const lines = String(res.stdout)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("INFO:"));
    // Return the first sensible path
    return lines.length > 0 ? lines[0] : null;
  } catch {
    return null;
  }
}

function compact<T>(arr: Array<T | undefined | null>): T[] {
  return arr.filter((x): x is T => x != null);
}

function joinIfExists(base: string | undefined, ...rest: string[]): string | null {
  if (!base) return null;
  return path.join(base, ...rest);
}
