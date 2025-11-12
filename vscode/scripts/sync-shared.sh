#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(dirname "$SCRIPT_DIR")"
MAIN_APP_DIR="$(dirname "$VSCODE_DIR")"
SHARED_DIR="$VSCODE_DIR/src/shared"

echo "📦 Syncing shared code from main app to extension..."

# Create shared directory
mkdir -p "$SHARED_DIR"

# Copy dateTime.ts (formatRelativeTime utility)
echo "   Copying dateTime.ts..."
cp "$MAIN_APP_DIR/src/utils/ui/dateTime.ts" "$SHARED_DIR/dateTime.ts"

# Create types.ts with relevant types
echo "   Extracting types..."
cat > "$SHARED_DIR/types.ts" << 'TYPES_HEADER'
/**
 * GENERATED FILE - DO NOT EDIT
 * Auto-copied from src/types/ during extension build
 * Source: vscode/scripts/sync-shared.sh
 */

TYPES_HEADER

# Extract RuntimeConfig type from runtime.ts
# Find line starting with "export type RuntimeConfig" and extract until the closing };
awk '/^export type RuntimeConfig/,/^    };$/' "$MAIN_APP_DIR/src/types/runtime.ts" >> "$SHARED_DIR/types.ts"

echo "" >> "$SHARED_DIR/types.ts"

# Extract WorkspaceMetadata interface from workspace.ts
# Need to include the import statement for RuntimeConfig
awk '/^export interface WorkspaceMetadata/,/^}$/' "$MAIN_APP_DIR/src/types/workspace.ts" >> "$SHARED_DIR/types.ts"

# Add header to dateTime.ts
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << 'DATETIME_HEADER'
/**
 * GENERATED FILE - DO NOT EDIT
 * Auto-copied from src/utils/ui/dateTime.ts during extension build
 * Source: vscode/scripts/sync-shared.sh
 */

DATETIME_HEADER
cat "$SHARED_DIR/dateTime.ts" >> "$TEMP_FILE"
mv "$TEMP_FILE" "$SHARED_DIR/dateTime.ts"

echo "✅ Synced shared code:"
echo "   - dateTime.ts (formatRelativeTime utility)"
echo "   - types.ts (RuntimeConfig, WorkspaceMetadata)"
