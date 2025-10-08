"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorktree = createWorktree;
exports.removeWorktree = removeWorktree;
exports.pruneWorktrees = pruneWorktrees;
exports.moveWorktree = moveWorktree;
exports.listWorktrees = listWorktrees;
exports.isGitRepository = isGitRepository;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function createWorktree(config, projectPath, branchName) {
    try {
        const workspacePath = config.getWorkspacePath(projectPath, branchName);
        // Create workspace directory if it doesn't exist
        if (!fs.existsSync(path.dirname(workspacePath))) {
            fs.mkdirSync(path.dirname(workspacePath), { recursive: true });
        }
        // Check if workspace already exists
        if (fs.existsSync(workspacePath)) {
            return {
                success: false,
                error: `Workspace already exists at ${workspacePath}`,
            };
        }
        // Check if branch exists
        const { stdout: branches } = await execAsync(`git -C "${projectPath}" branch -a`);
        const branchExists = branches
            .split("\n")
            .some((b) => b.trim() === branchName ||
            b.trim() === `* ${branchName}` ||
            b.trim() === `remotes/origin/${branchName}`);
        if (branchExists) {
            // Branch exists, create worktree with existing branch
            await execAsync(`git -C "${projectPath}" worktree add "${workspacePath}" "${branchName}"`);
        }
        else {
            // Branch doesn't exist, create new branch with worktree
            await execAsync(`git -C "${projectPath}" worktree add -b "${branchName}" "${workspacePath}"`);
        }
        return { success: true, path: workspacePath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
async function removeWorktree(workspacePath, options = { force: false }) {
    try {
        // Remove the worktree
        await execAsync(`git worktree remove "${workspacePath}" ${options.force ? "--force" : ""}`);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
async function pruneWorktrees(projectPath) {
    try {
        await execAsync(`git -C "${projectPath}" worktree prune`);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
async function moveWorktree(projectPath, oldPath, newPath) {
    try {
        // Check if new path already exists
        if (fs.existsSync(newPath)) {
            return {
                success: false,
                error: `Target path already exists: ${newPath}`,
            };
        }
        // Create parent directory for new path if needed
        const parentDir = path.dirname(newPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        // Move the worktree using git (from the main repository context)
        await execAsync(`git -C "${projectPath}" worktree move "${oldPath}" "${newPath}"`);
        return { success: true, path: newPath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
}
async function listWorktrees(projectPath) {
    try {
        const { stdout } = await execAsync(`git -C "${projectPath}" worktree list --porcelain`);
        const worktrees = [];
        const lines = stdout.split("\n");
        for (const line of lines) {
            if (line.startsWith("worktree ")) {
                const path = line.substring(9);
                if (path !== projectPath) {
                    // Exclude main worktree
                    worktrees.push(path);
                }
            }
        }
        return worktrees;
    }
    catch (error) {
        console.error("Error listing worktrees:", error);
        return [];
    }
}
async function isGitRepository(projectPath) {
    try {
        await execAsync(`git -C "${projectPath}" rev-parse --git-dir`);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=git.js.map