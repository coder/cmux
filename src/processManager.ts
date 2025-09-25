import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CONFIG_DIR = path.join(os.homedir(), '.cmux');
const LOCKS_DIR = path.join(CONFIG_DIR, 'locks', 'workspaces');

export interface ProcessLock {
  pid: number;
  command: string;
  workspacePath: string;
  startTime: number;
  projectName: string;
  branch: string;
}

export class ProcessManager {
  constructor() {
    this.ensureLockDirectory();
  }

  private ensureLockDirectory(): void {
    if (!fs.existsSync(LOCKS_DIR)) {
      fs.mkdirSync(LOCKS_DIR, { recursive: true });
    }
  }

  private getLockFilePath(projectName: string, branch: string): string {
    // Sanitize project name and branch for filesystem
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(LOCKS_DIR, `${safeName}-${safeBranch}.lock`);
  }

  async acquireLock(workspacePath: string, projectName: string, branch: string, command: string): Promise<boolean> {
    const lockFile = this.getLockFilePath(projectName, branch);
    
    // Check if lock already exists and is valid
    const existing = await this.getRunningProcess(projectName, branch);
    if (existing && await this.isProcessRunning(existing.pid)) {
      return false; // Lock is held by running process
    }

    // Create lock file
    const lock: ProcessLock = {
      pid: process.pid,
      command,
      workspacePath,
      startTime: Date.now(),
      projectName,
      branch
    };

    try {
      fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2), { flag: 'wx' }); // Exclusive write
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Race condition - another process grabbed it
        return false;
      }
      throw error;
    }
  }

  async releaseLock(projectName: string, branch: string): Promise<void> {
    const lockFile = this.getLockFilePath(projectName, branch);
    try {
      fs.unlinkSync(lockFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to release lock:', error);
      }
    }
  }

  async getRunningProcess(projectName: string, branch: string): Promise<ProcessLock | null> {
    const lockFile = this.getLockFilePath(projectName, branch);
    
    try {
      if (!fs.existsSync(lockFile)) {
        return null;
      }

      const data = fs.readFileSync(lockFile, 'utf-8');
      const lock: ProcessLock = JSON.parse(data);
      
      // Verify process is still running
      if (await this.isProcessRunning(lock.pid)) {
        return lock;
      } else {
        // Stale lock, clean it up
        this.releaseLock(projectName, branch);
        return null;
      }
    } catch (error) {
      console.error('Error reading lock file:', error);
      return null;
    }
  }

  async isProcessRunning(pid: number): Promise<boolean> {
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}"`);
        return stdout.includes(pid.toString());
      } catch {
        return false;
      }
    } else {
      try {
        // On Unix-like systems, signal 0 checks if process exists
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }
  }

  async terminateProcess(pid: number): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        await execAsync(`taskkill /PID ${pid} /F`);
      } else {
        process.kill(pid, 'SIGTERM');
        // Give it a moment to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if still running, force kill if needed
        if (await this.isProcessRunning(pid)) {
          process.kill(pid, 'SIGKILL');
        }
      }
      return true;
    } catch (error) {
      console.error('Failed to terminate process:', error);
      return false;
    }
  }

  async getAllRunningProcesses(): Promise<ProcessLock[]> {
    const processes: ProcessLock[] = [];
    
    try {
      const files = fs.readdirSync(LOCKS_DIR);
      
      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(LOCKS_DIR, file);
          try {
            const data = fs.readFileSync(lockPath, 'utf-8');
            const lock: ProcessLock = JSON.parse(data);
            
            if (await this.isProcessRunning(lock.pid)) {
              processes.push(lock);
            } else {
              // Clean up stale lock
              fs.unlinkSync(lockPath);
            }
          } catch (error) {
            console.error(`Error processing lock file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error listing lock files:', error);
    }
    
    return processes;
  }

  async cleanupStaleLocks(): Promise<void> {
    try {
      const files = fs.readdirSync(LOCKS_DIR);
      
      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = path.join(LOCKS_DIR, file);
          try {
            const data = fs.readFileSync(lockPath, 'utf-8');
            const lock: ProcessLock = JSON.parse(data);
            
            // Check if process is still running
            if (!await this.isProcessRunning(lock.pid)) {
              fs.unlinkSync(lockPath);
              console.log(`Cleaned up stale lock: ${file}`);
            }
          } catch (error) {
            console.error(`Error cleaning lock file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error during lock cleanup:', error);
    }
  }
}

export default new ProcessManager();