# Init Hooks

Add a `.cmux/init` executable script to your project root to run commands when creating new workspaces.

## Example

```bash
#!/bin/bash
set -e

bun install
bun run build
```

Make it executable:

```bash
chmod +x .cmux/init
```

## Behavior

- **Runs once** per workspace on creation
- **Streams output** to the workspace UI in real-time
- **Non-blocking** - workspace is immediately usable, even while hook runs
- **Exit codes preserved** - failures are logged but don't prevent workspace usage

The init script runs in the workspace directory with the workspace's environment.

## Environment Variables

Init hooks receive the following environment variables:

- `MUX_PROJECT_PATH` - Absolute path to the project root directory
  - **Local workspaces**: Path on your local machine
  - **SSH workspaces**: Path on the remote machine
- `MUX_RUNTIME` - Runtime type: `"local"` or `"ssh"`

Example usage:

```bash
#!/bin/bash
set -e

echo "Runtime: $MUX_RUNTIME"
echo "Project root: $MUX_PROJECT_PATH"
echo "Workspace directory: $PWD"

# Reference files in project root
if [ -f "$MUX_PROJECT_PATH/.env" ]; then
  cp "$MUX_PROJECT_PATH/.env" "$PWD/.env"
fi

# Runtime-specific behavior
if [ "$MUX_RUNTIME" = "local" ]; then
  echo "Running on local machine"
else
  echo "Running on SSH remote"
fi

bun install
```

## Use Cases

- Install dependencies (`npm install`, `bun install`, etc.)
- Run build steps
- Generate code or configs
- Set up databases or services
- Warm caches

## Output

Init output appears in a banner at the top of the workspace. Click to expand/collapse the log. The banner shows:

- Script path (`.cmux/init`)
- Status (running, success, or exit code on failure)
- Full stdout/stderr output

## Idempotency

The hook runs every time you create a workspace, even if you delete and recreate with the same name. Make your script idempotent if you're modifying shared state.
