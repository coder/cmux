# Project Secrets

Securely manage environment variables for your projects in cmux. Project secrets are automatically injected when the agent executes bash commands, making it easy to provide API keys, tokens, and other sensitive configuration.

## What Are Project Secrets?

Project secrets are key-value pairs stored per project that are:

- **Automatically injected** as environment variables when running bash commands
- **Stored locally** in your cmux config file
- **Project-scoped** - each project has its own set of secrets
- **Workspace-inherited** - all workspaces in a project use the same secrets

## Common Use Cases

- **API Keys**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`
- **Authentication tokens**: `NPM_TOKEN`, `DOCKER_HUB_TOKEN`
- **Database credentials**: `DATABASE_URL`, `POSTGRES_PASSWORD`
- **Service endpoints**: `API_BASE_URL`, `WEBHOOK_URL`
- **Build configuration**: `BUILD_ENV`, `FEATURE_FLAGS`

## Managing Secrets

### Opening the Secrets Modal

1. Find your project in the left sidebar
2. Hover over the project name
3. Click the 🔒 lock icon that appears
4. The secrets modal will open

### Adding a Secret

1. Click the "Add Secret" button
2. Enter the key name (e.g., `GITHUB_TOKEN`)
3. Enter the value
4. Use the eye icon (👁️) to toggle visibility
5. Click "Save" to apply changes

### Editing a Secret

1. Open the secrets modal for your project
2. Find the secret you want to modify
3. Update the key or value fields
4. Click "Save"

### Removing a Secret

1. Open the secrets modal
2. Click the "Remove" button next to the secret
3. Click "Save"

## How Secrets Are Used

When the agent runs bash commands (via the `bash` tool), all project secrets are automatically injected as environment variables:

```bash
# If you have a secret: GITHUB_TOKEN=ghp_abc123
# The agent can use it in commands:
gh api /user  # Uses GITHUB_TOKEN from environment
```

The agent doesn't need to explicitly reference secrets - they're available as regular environment variables in all bash executions within that project's workspaces.

## Security Considerations

### Storage

- Secrets are stored in `~/.cmux/config.json`
- **Stored in plaintext** - the config file is not encrypted
- The config file has standard user-only file permissions

### Best Practices

- **Use read-only tokens** when possible (e.g., GitHub tokens with minimal scopes)
- **Rotate tokens regularly** - update secrets when tokens expire or are compromised
- **Don't commit secrets** - cmux config is local-only, never commit it
- **Use fine-grained tokens** - grant minimum necessary permissions
- **Separate agent tokens** - use different tokens for AI agents vs personal use

### What Secrets Can Access

Secrets are available to:
- ✅ Bash commands executed by the agent
- ✅ Scripts run within the workspace
- ✅ Git operations (e.g., `gh` CLI commands)

Secrets are NOT:
- ❌ Sent to AI models (unless explicitly output in bash results)
- ❌ Visible in the chat UI
- ❌ Shared across different projects

## Troubleshooting

### Secrets Not Working

**Symptom**: Commands fail with authentication errors even though secrets are set.

**Solutions**:
- Verify the secret key name matches what the tool expects (e.g., `GITHUB_TOKEN` not `GH_TOKEN`)
- Check that you saved the secrets modal (click "Save" button)
- Restart cmux to ensure config changes are loaded
- Test the secret manually: Add a bash command like `echo $YOUR_SECRET_NAME` to verify it's injected

### Multiple Projects With Same Secret

**Symptom**: You need the same secret (e.g., `GITHUB_TOKEN`) across multiple projects.

**Solutions**:
- Copy the secret to each project individually (recommended for different values)
- Or use global environment variables (set in your shell config) as a fallback
- Note: Project secrets override global environment variables with the same name

### Secret Values With Special Characters

**Symptom**: Secret values containing quotes, spaces, or special characters cause issues.

**Solutions**:
- Secrets are injected as-is, no escaping needed
- Avoid trailing newlines or spaces in values
- If pasting from terminal output, ensure you copy only the token value

## Migration Note

If you previously used global environment variables for secrets (e.g., in `~/.zshrc`), you can migrate them to project secrets for better organization and scope isolation.

## Related

- [Agentic Git Identity](./agentic-git-identity.md) - Configure Git credentials for AI commits
- For agent-specific environment variables like `GIT_AUTHOR_*`, use shell config files instead of project secrets
