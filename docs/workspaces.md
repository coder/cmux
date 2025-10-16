# Workspaces

Currently, cmux supports one Workspace backend: [git worktrees](https://git-scm.com/docs/git-worktree).

We plan on adding support for SSH and Docker backends in the near future for
additional isolation and security.

## Basics of worktrees

A worktree is a seperate directory on the same filesystem as the main repository that shares a `.git`
but has independent working changes and checkout state. **All committed changes from any worktree are
visible to all other worktrees including the main repository.**

It's important to note that a **worktree is not locked to a branch**. The agent can switch to new
branches, enter a detached HEAD state, etc. When you create a workspace, the agent will
begin at the selected branch but may switch freely in the course of the session. **We empower users to define their agent's branching strategy in AGENTS.md**

## Reviewing code

Here are a few practical approaches to reviewing changes from workspaces,
depending on how much you want your agent to interact with `git`:

- **Agent codes, commits, and pushes**: Ask agent to submit a PR and review changes in your git Web UI (GitHub, GitLab, etc.)
  - Also see: [Agentic Git Identity](./agentic-git-identity.md)
  - This is the preferred approach for `cmux` development but requires additional care with repository security.
- **Agent codes and commits**: Review changes from the main repository via `git diff <workspace-branch>`, push changes when deemed acceptable.
- **Agent codes**: enter worktree (click Terminal icon in workspace top bar), run `git add -p` and progressively accept changes into a commit.

## Reviewing functionality

Some changes (esp. UI ones) require the Human to determine acceptability. An effective approach
for this is:

1. Ask agent to commit WIP when its ready for Human review
1. Human, in main repository, checks out the workspace branch in a detached HEAD state: `git checkout --detach <workspace-branch>`

Note: this workflow uses the detached HEAD state because the branch is already
checked out in the workspace and you cannot check out the same branch multiple times
across worktrees.

If you want faster iteration in between commits, you can hop into the worktree directory and run a
dev server (e.g. `bun dev`) there directly and observe the agent's work in real-time.

## Filesystem Layout

All worktrees are stored in `~/.cmux/src/<project-name>/<workspace-name>`.

Example layout:

```
~/.cmux/src/
  cmux-main/
    improved-auth-ux/
    fix-ci-flakes/
```
