import { spawn } from "child_process";
import { log } from "./log";
import type { PullRequestInfo } from "@/types/workspace";

/**
 * Service for interacting with GitHub
 */
export class GitHubService {
  /**
   * Get the open PR for the current branch in a workspace
   * Returns null if no PR exists or if gh CLI is not available
   */
  async getOpenPR(workspacePath: string): Promise<PullRequestInfo | null> {
    try {
      // Check if gh CLI is available
      const ghAvailable = await this.isGhAvailable();
      if (!ghAvailable) {
        log.debug("GitHub CLI (gh) not available");
        return null;
      }

      // Get PR info for the current branch
      const result = await this.execGh(
        ["pr", "view", "--json", "number,title,url,state"],
        workspacePath
      );

      if (!result) {
        return null;
      }

      const pr = JSON.parse(result) as {
        number: number;
        title: string;
        url: string;
        state: string;
      };

      // Only return if PR is open
      if (pr.state === "OPEN") {
        return {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: pr.state as "OPEN",
        };
      }

      return null;
    } catch (error) {
      log.debug("Failed to get PR info:", error);
      return null;
    }
  }

  /**
   * Check if GitHub CLI is available
   */
  private async isGhAvailable(): Promise<boolean> {
    try {
      await this.execCommand("which", ["gh"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute gh command
   */
  private execGh(args: string[], cwd: string): Promise<string | null> {
    return this.execCommand("gh", args, cwd);
  }

  /**
   * Execute a command and return stdout
   */
  private execCommand(command: string, args: string[], cwd?: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      // Ignore stderr - we don't need it
      proc.stderr.on("data", () => {
        // no-op
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          // Non-zero exit is normal for "no PR" case
          resolve(null);
        }
      });

      proc.on("error", (error) => {
        reject(error);
      });
    });
  }
}
