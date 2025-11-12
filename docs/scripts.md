# Workspace Scripts

Execute custom scripts from your workspace using slash commands with full auto-completion.

## Overview

Scripts are stored in `.cmux/scripts/` within each workspace and can be executed via `/script <name>` or the shorter `/s <name>` alias. Scripts run in the workspace directory with full access to project secrets and environment variables.

**Key Point**: Scripts are workspace-specific, not project-global. Each workspace can have its own scripts in its `.cmux/scripts/` directory.

## Creating Scripts

1. **Create the scripts directory**:

   ```bash
   mkdir -p .cmux/scripts
   ```

2. **Add an executable script**:

   ```bash
   #!/usr/bin/env bash
   # Description: Deploy to staging environment

   echo "Deploying to staging..."
   # Your deployment commands here
   ```

3. **Make it executable**:
   ```bash
   chmod +x .cmux/scripts/deploy
   ```

## Usage

### Basic Execution

Type `/s` or `/script` in chat to see available scripts with auto-completion:

```
/s deploy
```

### With Arguments

Pass arguments to scripts:

```
/s deploy --dry-run
/script test --verbose --coverage
```

Arguments are passed directly to the script as `$1`, `$2`, etc.

## Script Descriptions

Add a description to make scripts easier to identify in auto-completion:

```bash
#!/usr/bin/env bash
# Description: Run full test suite with coverage
```

or

```bash
#!/usr/bin/env bash
# @description Run full test suite with coverage
```

The description appears in the command palette and slash command suggestions.

## Execution Context

Scripts run with:

- **Working directory**: The workspace directory (same as bash_tool)
- **Environment**: Full workspace environment + project secrets + special cmux variables
- **Timeout**: 5 minutes by default
- **Streams**: stdout/stderr captured and logged

### Environment Variables

Scripts receive special environment variables for controlling cmux behavior:

#### `CMUX_OUTPUT`

Path to a temporary file for custom toast display content. Write markdown here for rich formatting in the UI toast:

```bash
#!/usr/bin/env bash
# Description: Deploy with custom output

echo "Deploying..." # Regular stdout for logs

# Write formatted output for toast display
cat >> "$CMUX_OUTPUT" << 'EOF'
## 🚀 Deployment Complete

✅ Successfully deployed to staging

**Details:**
- Version: 2.1.3
- Environment: staging
- Duration: 45s
EOF
```

The toast will display the markdown-formatted content instead of the default "Script completed successfully" message.

#### `CMUX_PROMPT`

Path to a temporary file for sending messages to the agent. Write prompts here to trigger agent actions:

```bash
#!/usr/bin/env bash
# Description: Rebase with conflict handling

if git pull --rebase origin main; then
  echo "✅ Successfully rebased onto main" >> "$CMUX_OUTPUT"
else
  echo "⚠️ Rebase conflicts detected" >> "$CMUX_OUTPUT"

  # Send conflict details to agent for analysis
  cat >> "$CMUX_PROMPT" << 'EOF'
The rebase encountered conflicts. Please help resolve them:

```

$(git status)

```

Analyze the conflicts and propose resolutions.
EOF
fi
```

When the script completes, the prompt file content is automatically sent as a new user message, triggering the agent to respond.

#### Combined Usage

You can use both environment files together:

```bash
#!/usr/bin/env bash
# Description: Run tests and report failures

if npm test > test-output.txt 2>&1; then
  echo "✅ All tests passed" >> "$CMUX_OUTPUT"
else
  # Show summary in toast
  echo "❌ Tests failed" >> "$CMUX_OUTPUT"

  # Ask agent to analyze and fix
  cat >> "$CMUX_PROMPT" << EOF
The test suite failed. Please analyze and fix:

\`\`\`
$(cat test-output.txt)
\`\`\`
EOF
fi
```

**Result:**

1. Toast displays "❌ Tests failed"
2. Agent receives test output and starts analyzing
3. Agent proposes fixes

### File Size Limits

- **CMUX_OUTPUT**: Maximum 10KB (truncated if exceeded)
- **CMUX_PROMPT**: Maximum 100KB (truncated if exceeded)

## Example Scripts

### Deployment Script

```bash
#!/usr/bin/env bash
# Description: Deploy application to specified environment
set -euo pipefail

ENV=${1:-staging}
echo "Deploying to $ENV..."

# Build
npm run build

# Deploy
aws s3 sync dist/ s3://my-bucket-$ENV/
echo "Deployment complete!"
```

### Test Runner

```bash
#!/usr/bin/env bash
# Description: Run tests with optional flags
set -euo pipefail

FLAGS="${@:---coverage}"
echo "Running tests with: $FLAGS"
npm test $FLAGS
```

### Database Migration

```bash
#!/usr/bin/env bash
# Description: Run database migrations
set -euo pipefail

echo "Running migrations..."
npm run migrate
echo "Migrations complete!"
```

## Tips

**Idempotency**: Scripts can run multiple times. Make them idempotent when modifying shared state.

**Error Handling**: Use `set -euo pipefail` to fail fast on errors.

**Logging**: Echo progress messages - they appear in real-time during execution.

**Arguments**: Always handle optional arguments with defaults:

```bash
ENV=${1:-staging}  # Default to 'staging' if no arg provided
```

**Exit Codes**: Non-zero exit codes are displayed as warnings in the UI.

## Differences from Init Hooks

| Feature       | Init Hooks (`.cmux/init`)  | Scripts (`.cmux/scripts/*`) |
| ------------- | -------------------------- | --------------------------- |
| **When Run**  | Once on workspace creation | On-demand via slash command |
| **Execution** | Automatic                  | Manual user invocation      |
| **Use Case**  | Setup dependencies         | Development tasks           |
| **Arguments** | None                       | Supports arguments          |
| **Frequency** | One-time per workspace     | Any time, any number        |

## Script Discovery

- Scripts are discovered automatically from `.cmux/scripts/` in the current workspace
- Only executable files appear in suggestions
- Non-executable files are ignored
- Cache refreshes when you switch workspaces

## Keyboard Shortcuts

Use existing chat and command palette shortcuts:

- Type `/s` in chat for inline suggestions
- `Cmd+Shift+P` (or `Ctrl+Shift+P`) → `/s` for command palette
- Arrow keys to select, Enter to run

## Troubleshooting

**Script not appearing in suggestions?**

- Ensure file is executable: `chmod +x .cmux/scripts/scriptname`
- Verify file is in `.cmux/scripts/` directory within your workspace
- Switch to another workspace and back to refresh the cache

**Script fails with "not found"?**

- Check shebang line is correct: `#!/usr/bin/env bash`
- Verify script has execute permissions
- Test script directly: `./.cmux/scripts/scriptname`

**Script times out?**

- Scripts have 5 minute timeout by default
- Split long-running operations into separate scripts
- Consider running processes in background if needed
