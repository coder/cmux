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

- `PROJECT_PATH` - Absolute path to the project root directory

Example usage:

```bash
#!/bin/bash
set -e

echo "Project root: $PROJECT_PATH"
echo "Workspace directory: $PWD"

# Reference files in project root
if [ -f "$PROJECT_PATH/.env" ]; then
  cp "$PROJECT_PATH/.env" "$PWD/.env"
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
