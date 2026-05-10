#!/usr/bin/env bash
# Copies repo-root sources into the add-on folder so the Dockerfile
# build context is self-contained.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Repo root:  $REPO_ROOT"
echo "Add-on dir: $ADDON_DIR"

# --- Backend ---
echo "Copying backend..."
rm -rf "$ADDON_DIR/backend"
cp -r "$REPO_ROOT/backend" "$ADDON_DIR/backend"
cp "$REPO_ROOT/backend/requirements.txt" "$ADDON_DIR/requirements.txt"

# --- Frontend build ---
echo "Building frontend..."
cd "$REPO_ROOT/frontend"
npm ci --prefer-offline
npm run build:web
cd "$REPO_ROOT"

echo "Copying frontend/dist..."
rm -rf "$ADDON_DIR/frontend"
mkdir -p "$ADDON_DIR/frontend"
cp -r "$REPO_ROOT/frontend/dist" "$ADDON_DIR/frontend/dist"

# --- Optional: default dashboard seed ---
if [ -f "$REPO_ROOT/oura_dashboard.json" ]; then
    cp "$REPO_ROOT/oura_dashboard.json" "$ADDON_DIR/oura_dashboard.json"
fi

echo "Done. You can now build the Docker image from: $ADDON_DIR"
