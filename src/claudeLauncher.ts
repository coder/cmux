import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import processManager, { ProcessLock } from './processManager';
import { getProjectName } from './config';

export interface LaunchResult {
  success: boolean;
  pid?: number;
  error?: string;
  alreadyRunning?: boolean;
}

export interface ExistingProcess {
  pid: number;
  startTime: number;
  workspacePath: string;
}

export class ClaudeLauncher {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  private getProcessKey(projectName: string, branch: string): string {
    return `${projectName}-${branch}`;
  }

  async launchClaudeCode(workspacePath: string, projectPath: string, branch: string): Promise<LaunchResult> {
    const projectName = getProjectName(projectPath);
    const processKey = this.getProcessKey(projectName, branch);

    // Check for existing instance
    const existing = await this.checkExisting(projectName, branch);
    if (existing) {
      return {
        success: false,
        error: `Claude Code is already running for this workspace (PID: ${existing.pid})`,
        alreadyRunning: true,
        pid: existing.pid
      };
    }

    // Try to acquire lock
    const lockAcquired = await processManager.acquireLock(
      workspacePath,
      projectName,
      branch,
      'claude'
    );

    if (!lockAcquired) {
      return {
        success: false,
        error: 'Failed to acquire lock for workspace',
        alreadyRunning: true
      };
    }

    try {
      // Launch Claude Code
      const claudeProcess = spawn('claude', [], {
        cwd: workspacePath,
        detached: false, // Keep attached to parent for now
        stdio: 'ignore',
        env: {
          ...process.env,
          // Add any Claude-specific environment variables here
        }
      });

      const pid = claudeProcess.pid;
      if (!pid) {
        await processManager.releaseLock(projectName, branch);
        return {
          success: false,
          error: 'Failed to launch Claude Code - no PID returned'
        };
      }

      // Update lock with actual PID
      await processManager.releaseLock(projectName, branch);
      await processManager.acquireLock(workspacePath, projectName, branch, 'claude');
      
      // Store process reference
      this.activeProcesses.set(processKey, claudeProcess);

      // Handle process exit
      claudeProcess.on('exit', async (code, signal) => {
        console.log(`Claude Code exited for ${processKey} with code ${code}, signal ${signal}`);
        await processManager.releaseLock(projectName, branch);
        this.activeProcesses.delete(processKey);
      });

      claudeProcess.on('error', async (error) => {
        console.error(`Claude Code error for ${processKey}:`, error);
        await processManager.releaseLock(projectName, branch);
        this.activeProcesses.delete(processKey);
      });

      return {
        success: true,
        pid
      };
    } catch (error: any) {
      await processManager.releaseLock(projectName, branch);
      return {
        success: false,
        error: error.message || 'Failed to launch Claude Code'
      };
    }
  }

  async checkExisting(projectName: string, branch: string): Promise<ExistingProcess | null> {
    const lock = await processManager.getRunningProcess(projectName, branch);
    if (lock) {
      return {
        pid: lock.pid,
        startTime: lock.startTime,
        workspacePath: lock.workspacePath
      };
    }
    return null;
  }

  async focusExisting(pid: number): Promise<void> {
    // On macOS, we can try to bring the window to front
    if (process.platform === 'darwin') {
      try {
        // This would require AppleScript or similar
        // For now, just log
        console.log(`Would focus PID ${pid} if implemented`);
      } catch (error) {
        console.error('Failed to focus existing Claude instance:', error);
      }
    }
    // On other platforms, focusing external processes is more complex
  }

  async terminateProcess(projectName: string, branch: string): Promise<boolean> {
    const processKey = this.getProcessKey(projectName, branch);
    const lock = await processManager.getRunningProcess(projectName, branch);
    
    if (!lock) {
      return false;
    }

    // Try to terminate the process
    const terminated = await processManager.terminateProcess(lock.pid);
    
    if (terminated) {
      // Clean up our reference
      this.activeProcesses.delete(processKey);
      // Release the lock
      await processManager.releaseLock(projectName, branch);
    }
    
    return terminated;
  }

  async getAllRunningClaudes(): Promise<ProcessLock[]> {
    return await processManager.getAllRunningProcesses();
  }

  async cleanupStaleLocks(): Promise<void> {
    await processManager.cleanupStaleLocks();
  }
}

export default new ClaudeLauncher();