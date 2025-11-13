#!/usr/bin/env bash
# Verify marketplace publishing setup
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔍 Verifying VS Code Marketplace setup..."
echo ""

# Check if vsce is available
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Please install Node.js"
    exit 1
fi

# Check if extension can be packaged
echo "📦 Testing extension packaging..."
if ! npx @vscode/vsce package --no-git-tag-version &> /dev/null; then
    echo "❌ Extension packaging failed"
    echo "Run: cd vscode && bun run package"
    exit 1
fi
echo "✅ Extension packages successfully"
echo ""

# Check publisher login
echo "🔐 Checking publisher authentication..."
if npx @vscode/vsce ls-publishers 2>&1 | grep -q "coder"; then
    echo "✅ Publisher 'coder' found"
else
    echo "⚠️  Publisher 'coder' not authenticated"
    echo "Run: npx @vscode/vsce login coder"
    echo ""
fi

# Check package.json fields
echo "📋 Verifying package.json..."
REQUIRED_FIELDS=("name" "version" "publisher" "engines" "icon")
for field in "${REQUIRED_FIELDS[@]}"; do
    if grep -q "\"$field\"" package.json; then
        echo "✅ $field: present"
    else
        echo "❌ $field: missing"
    fi
done
echo ""

# Check icon
if [ -f "icon.png" ]; then
    echo "✅ icon.png exists"
else
    echo "❌ icon.png missing"
fi
echo ""

# Check license
if [ -f "LICENSE" ] || [ -L "LICENSE" ]; then
    echo "✅ LICENSE exists"
else
    echo "⚠️  LICENSE missing or not symlinked"
fi
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo "Next steps:"
echo "1. Ensure Azure DevOps PAT is configured (see MARKETPLACE_RELEASE.md)"
echo "2. Add VSCE_PAT to GitHub repository secrets"
echo "3. Test publish: npx @vscode/vsce publish --dry-run"
echo "4. When ready: git tag vscode-v0.1.0 && git push origin vscode-v0.1.0"
