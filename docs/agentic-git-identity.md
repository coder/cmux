# Agentic Git Identity

Configure cmux to use a separate Git identity for AI-generated commits, making it easy to distinguish between human and AI contributions.

## Why Use a Separate Identity?

Using a dedicated Git identity for AI-generated commits provides:

- **Clear attribution** - Distinguish AI contributions from human commits at a glance
- **Better analytics** - Track AI contributions separately in your repository
- **Professional transparency** - Show that you're responsibly using AI assistance
- **Repository policies** - Some organizations require AI-generated code to be clearly marked

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

Set environment variables to configure the Git author and committer:

### macOS/Linux

Add to your shell configuration (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export GIT_AUTHOR_NAME="Your Name (Agent)"
export GIT_AUTHOR_EMAIL="yourname+ai@example.com"
export GIT_COMMITTER_NAME="Your Name (Agent)"
export GIT_COMMITTER_EMAIL="yourname+ai@example.com"
```

Then reload your shell:

```bash
source ~/.zshrc  # or ~/.bashrc
```

### Windows

Set environment variables in PowerShell:

```powershell
[System.Environment]::SetEnvironmentVariable('GIT_AUTHOR_NAME', 'Your Name (Agent)', 'User')
[System.Environment]::SetEnvironmentVariable('GIT_AUTHOR_EMAIL', 'yourname+ai@example.com', 'User')
[System.Environment]::SetEnvironmentVariable('GIT_COMMITTER_NAME', 'Your Name (Agent)', 'User')
[System.Environment]::SetEnvironmentVariable('GIT_COMMITTER_EMAIL', 'yourname+ai@example.com', 'User')
```

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

Set up Git to use the GitHub CLI for authentication:

```bash
# Clear any existing credential helpers and use gh
git config --global --unset-all credential.helper
git config --global credential.helper ""
git config --global --add credential.helper '!gh auth git-credential'
```

The empty `credential.helper ""` resets the credential chain, preventing system keychains from interfering.

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
- Ensure empty helper `""` comes before `!gh auth git-credential`
- Clear keychain credentials if needed (macOS): Delete github.com entry from Keychain Access

### Author and Committer Differ

Missing `GIT_COMMITTER_*` environment variables:

- Set all four variables: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`
- Restart your shell/terminal
- Verify with: `env | grep GIT_`

### Changes Don't Take Effect

Environment variables aren't loaded:

- Restart your terminal/shell
- For cmux, restart the application to pick up new environment variables
- Verify variables: `env | grep GIT_`

## Best Practices

- **Commit prefixes**: Use 🤖 emoji or `[AI]` prefix in commit messages
- **Token security**: Never commit tokens to repositories
- **Token rotation**: Rotate tokens periodically for security
- **Repository access**: Only grant access to repositories the agent needs
- **Documentation**: Update team docs about AI-generated commits

## Reverting to Personal Identity

To switch back to your personal identity for manual commits:

```bash
# Temporarily unset for current shell
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

# Or remove from shell config and restart terminal
```

Or switch the `gh` authentication:

```bash
# Switch to different GitHub account
gh auth switch
```
