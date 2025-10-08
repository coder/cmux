# Agentic Git Identity

Configure cmux to use a separate Git identity for AI-generated commits, making it easy to distinguish between human and AI contributions. Reasons to use a separate identity include:

- Clear attribution
- Preventing (accidental) destructive actions
- Enforcing review flow, e.g. preventing AI from merging into `main` while allowing humans


## Setup Overview

1. Create a GitHub account for your agent (e.g., `username-agent`)
2. Generate a Classic GitHub token
3. Configure Git to use the agent identity
4. Configure Git credentials to use the token

## Step 1: Create Agent GitHub Account

Create a separate GitHub account for your agent:

1. Sign up at [github.com/signup](https://github.com/signup)
2. Use a distinctive username (e.g., `yourname-agent`, `yourname-ai`)
3. Use a separate email (GitHub allows plus-addressing: `yourname+ai@example.com`)

> **Note**: This is optional but recommended. You can also use your main account with a different email/name.

## Step 2: Generate Classic GitHub Token

Classic tokens are easier to configure than fine-grained tokens for repository access.

1. Log into your agent GitHub account
2. Go to [Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
3. Click "Generate new token (classic)"
4. Configure the token:
   - **Note**: "cmux agent token" (or similar)
   - **Expiration**: Choose based on your security preferences
   - **Scopes**: Select `repo` (Full control of private repositories)
5. Click "Generate token"
6. **Copy the token immediately** - you won't see it again

## Step 3: Configure Git Identity

Add the Git identity environment variables as [Project Secrets](./project-secrets.md) in cmux:

1. Open cmux and find your project in the sidebar
2. Click the 🔒 lock icon to open the secrets modal
3. Add the following four secrets:
   - `GIT_AUTHOR_NAME` = `Your Name (Agent)`
   - `GIT_AUTHOR_EMAIL` = `yourname+ai@example.com`
   - `GIT_COMMITTER_NAME` = `Your Name (Agent)`
   - `GIT_COMMITTER_EMAIL` = `yourname+ai@example.com`
4. Click "Save"

These environment variables will be automatically injected when the agent runs Git commands in that project.

> **Note**: If you need the agent identity outside of cmux, you can alternatively set these as global environment variables in your shell configuration (`~/.zshrc`, `~/.bashrc`, etc.)

## Step 4: Configure GitHub Authentication

### Install GitHub CLI

If you don't have it:

```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md
```

### Configure Git Credential Helper

Set up Git to use the GitHub CLI for authentication. The recommended approach is to use `gh auth setup-git`, which scopes the credential helper to GitHub only:

```bash
# Configure gh as credential helper for GitHub (recommended)
gh auth setup-git
```

This configures Git to use `gh` for GitHub authentication while preserving your existing credential helpers for other Git hosts.

**Alternative: Manual configuration (for advanced users)**

If you need more control or want to completely replace existing credential helpers:

```bash
# Scope to GitHub only (preserves other credential helpers)
git config --global credential.https://github.com.helper '!gh auth git-credential'

# OR: Replace all credential helpers (may break non-GitHub authentication)
git config --global --unset-all credential.helper
git config --global credential.helper ""
git config --global --add credential.helper '!gh auth git-credential'
```

⚠️ **Warning**: The "replace all" approach will disable platform keychain helpers and may break Git authentication for non-GitHub remotes (GitLab, Bitbucket, etc.).

### Authenticate with Your Token

```bash
gh auth login --with-token <<< "your_token_here"
```

Or interactively:

```bash
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Paste an authentication token
# Paste your token
```

### Verify Configuration

Check that authentication is working:

```bash
# Check git config
git config --show-origin --get-all credential.helper

# Check gh authentication
gh auth status

# Test repository access
gh repo view owner/repo
```

## Verification

Create a test commit to verify the identity:

```bash
echo "test" > test-identity.txt
git add test-identity.txt
git commit -m "🤖 Test agent identity"
git log -1 --format=full
```

You should see your agent name and email as both author and committer:

```
commit abc123...
Author: Your Name (Agent) <yourname+ai@example.com>
Commit: Your Name (Agent) <yourname+ai@example.com>

    🤖 Test agent identity
```

## Troubleshooting

### Push Fails with "Repository not found"

The token might not have access to the repository:

- Verify the token has `repo` scope
- For private repos, ensure the agent account has access to the repository
- Try: `gh repo view owner/repo` to test access

### Push Uses Wrong Credentials

System keychain might be overriding `gh` credentials:

- Verify git credential config: `git config --show-origin --get-all credential.helper`
- If you used `gh auth setup-git`, it should be properly scoped to GitHub
- If you manually configured, ensure the credential helper is either:
  - Scoped: `credential.https://github.com.helper`
  - Or global with reset: empty helper `""` comes before `!gh auth git-credential`
- Clear keychain credentials if needed (macOS): Delete github.com entry from Keychain Access

### Author and Committer Differ

Missing `GIT_COMMITTER_*` secrets:

- Ensure all four secrets are set in Project Secrets: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`
- Click "Save" in the secrets modal
- Restart cmux to pick up the changes
- Test by running a git command via the agent and checking the commit

### Changes Don't Take Effect

Secrets not being applied:

- Verify the secrets are saved in the Project Secrets modal
- Restart cmux to ensure the config is reloaded
- Test with a simple bash command: `echo $GIT_AUTHOR_NAME` via the agent
- Ensure you're working in the correct project (secrets are project-scoped)

## Best Practices

- **Commit prefixes**: Use 🤖 emoji or `[AI]` prefix in commit messages
- **Token security**: Never commit tokens to repositories
- **Token rotation**: Rotate tokens periodically for security
- **Repository access**: Only grant access to repositories the agent needs
- **Documentation**: Update team docs about AI-generated commits

## Reverting to Personal Identity

To switch back to your personal identity:

**For cmux projects:**

1. Open the Project Secrets modal (🔒 icon)
2. Remove the four Git identity secrets
3. Click "Save"
4. Restart cmux

Commits will now use your default Git identity from `~/.gitconfig`.

**For GitHub authentication:**

Switch to your personal GitHub account:

```bash
# Switch to different GitHub account
gh auth switch
```
