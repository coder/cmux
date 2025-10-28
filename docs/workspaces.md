# Workspaces

Workspaces in cmux provide isolated development environments for parallel agent work. Each workspace maintains its own Git state, allowing you to explore different approaches, run multiple tasks simultaneously, or test changes without affecting your main repository.

## Workspace Types

cmux supports two workspace backends:

- **[Local Workspaces](./local.md)**: Use [git worktrees](https://git-scm.com/docs/git-worktree) on your local machine. Worktrees share the `.git` directory with your main repository while maintaining independent working changes.

- **[SSH Workspaces](./ssh.md)**: Regular git clones on a remote server accessed via SSH. These are completely independent repositories stored on the remote machine.

## Choosing a Backend

The workspace backend is selected when you create a workspace:

- **Local**: Best for fast iteration, local testing, and when you want to leverage your local machine's resources
- **SSH**: Ideal for heavy workloads, long-running tasks, or when you need access to remote infrastructure

## Key Concepts

- **Isolation**: Each workspace has independent working changes and Git state
- **Branch flexibility**: Workspaces can switch branches, enter detached HEAD state, or create new branches as needed
- **Parallel execution**: Run multiple workspaces simultaneously on different tasks
- **Shared commits**: Local workspaces (using worktrees) share commits with the main repository immediately

See the specific workspace type pages for detailed setup and usage instructions.
