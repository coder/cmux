#!/bin/bash
# Sets up macOS code signing and notarization from GitHub secrets
# Usage: ./scripts/setup-macos-signing.sh
#
# Required environment variables:
#   MACOS_CERTIFICATE          - Base64-encoded .p12 certificate
#   MACOS_CERTIFICATE_PWD      - Certificate password
#   AC_APIKEY_P8_BASE64        - Base64-encoded Apple API key (.p8)
#   AC_APIKEY_ID               - Apple API Key ID
#   AC_APIKEY_ISSUER_ID        - Apple API Issuer ID

set -euo pipefail

# Setup code signing certificate
if [ -n "${MACOS_CERTIFICATE:-}" ]; then
  echo "Setting up code signing certificate..."
  
  # Decode certificate
  CERT_PATH=/tmp/certificate.p12
  echo "$MACOS_CERTIFICATE" | base64 -D >"$CERT_PATH"
  
  # Create a unique keychain for this build (avoid parallel build conflicts)
  KEYCHAIN_NAME="build-$(date +%s).keychain"
  KEYCHAIN_PATH="$HOME/Library/Keychains/$KEYCHAIN_NAME"
  KEYCHAIN_PASSWORD=$(openssl rand -hex 32)
  
  # Delete keychain if it already exists (cleanup from previous runs)
  security delete-keychain "$KEYCHAIN_PATH" 2>/dev/null || true
  
  # Create new keychain
  security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  
  # Import certificate to keychain
  security import "$CERT_PATH" -k "$KEYCHAIN_PATH" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
  
  # Add keychain to search list and set as default
  security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | sed s/\"//g)
  security default-keychain -s "$KEYCHAIN_PATH"
  
  # Allow codesign to access the keychain without prompting
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  
  # Export for electron-builder (it will use the already-imported certificate)
  echo "CSC_LINK=$CERT_PATH" >>"$GITHUB_ENV"
  echo "CSC_KEY_PASSWORD=$MACOS_CERTIFICATE_PWD" >>"$GITHUB_ENV"
  echo "CSC_KEYCHAIN=$KEYCHAIN_PATH" >>"$GITHUB_ENV"
  
  echo "✅ Code signing certificate imported to keychain"
else
  echo "⚠️  No code signing certificate provided - building unsigned"
fi

# Setup notarization credentials
if [ -n "${AC_APIKEY_ID:-}" ]; then
  echo "Setting up notarization credentials..."
  echo "$AC_APIKEY_P8_BASE64" | base64 -D >/tmp/AuthKey.p8
  echo "APPLE_API_KEY=/tmp/AuthKey.p8" >>"$GITHUB_ENV"
  echo "APPLE_API_KEY_ID=$AC_APIKEY_ID" >>"$GITHUB_ENV"
  echo "APPLE_API_ISSUER=$AC_APIKEY_ISSUER_ID" >>"$GITHUB_ENV"
  echo "✅ Notarization credentials configured"
else
  echo "⚠️  No notarization credentials - skipping notarization"
fi
