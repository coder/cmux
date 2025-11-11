#!/bin/bash
# Verify the cmux VS Code extension is properly built and packaged

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying cmux VS Code Extension"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check source files exist
echo "📝 Checking source files..."
for file in extension.ts cmuxConfig.ts workspaceOpener.ts; do
  if [ -f "$VSCODE_DIR/src/$file" ]; then
    lines=$(wc -l < "$VSCODE_DIR/src/$file" | xargs)
    echo "  ✓ src/$file ($lines lines)"
  else
    echo "  ❌ src/$file (missing)"
    exit 1
  fi
done
echo ""

# Check compiled files exist
echo "📦 Checking compiled output..."
for file in extension.js cmuxConfig.js workspaceOpener.js; do
  if [ -f "$VSCODE_DIR/out/$file" ]; then
    echo "  ✓ out/$file"
  else
    echo "  ❌ out/$file (missing - run: npm run compile)"
    exit 1
  fi
done
echo ""

# Check package exists
echo "🎁 Checking package..."
if [ -f "$VSCODE_DIR/cmux-0.1.0.vsix" ]; then
  size=$(ls -lh "$VSCODE_DIR/cmux-0.1.0.vsix" | awk '{print $5}')
  echo "  ✓ cmux-0.1.0.vsix ($size)"
else
  echo "  ❌ cmux-0.1.0.vsix (missing - run: npm run package)"
  exit 1
fi
echo ""

# Check icon
echo "🎨 Checking icon..."
if [ -f "$VSCODE_DIR/icon.png" ]; then
  size=$(ls -lh "$VSCODE_DIR/icon.png" | awk '{print $5}')
  echo "  ✓ icon.png ($size)"
else
  echo "  ⚠️  icon.png (missing - run: ./scripts/create-icon.sh)"
fi
echo ""

# Check documentation
echo "📚 Checking documentation..."
for file in README.md DEVELOPMENT.md CHANGELOG.md; do
  if [ -f "$VSCODE_DIR/$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ❌ $file (missing)"
  fi
done
echo ""

# Test config reader if config exists
echo "🧪 Testing config reader..."
if [ -f "$HOME/.cmux/config.json" ]; then
  if command -v node &> /dev/null; then
    # Create quick test
    cat > "$VSCODE_DIR/test-temp.js" << 'TESTEOF'
const { getAllWorkspaces } = require("./out/cmuxConfig.js");
const workspaces = getAllWorkspaces();
console.log(`  ✓ Found ${workspaces.length} workspace(s)`);
if (workspaces.length > 0) {
  const sample = workspaces[0];
  console.log(`  ✓ Sample: [${sample.projectName}] ${sample.name}`);
}
TESTEOF
    cd "$VSCODE_DIR" && node test-temp.js
    rm "$VSCODE_DIR/test-temp.js"
  else
    echo "  ⚠️  Node.js not found, skipping config test"
  fi
else
  echo "  ⚠️  No cmux config found at ~/.cmux/config.json"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Extension verification complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 To install:"
echo "   code --install-extension $VSCODE_DIR/cmux-0.1.0.vsix"
echo ""
echo "🚀 To use:"
echo "   Cmd+Shift+P → 'cmux: Open Workspace'"
echo ""
