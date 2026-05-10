#!/usr/bin/env bash
# Copies repo-root sources into the add-on folder so the Dockerfile
# build context is self-contained. Mirrors exactly what the CI workflow does.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Repo root:  $REPO_ROOT"
echo "Add-on dir: $ADDON_DIR"

# rsync everything except directories that shouldn't be in the Docker context
rsync -a \
    --exclude='addons' \
    --exclude='.git' \
    --exclude='.github' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='dist-electron' \
    --exclude='.gitignore' \
    "$REPO_ROOT/" "$ADDON_DIR/"

# requirements.txt lives inside backend/ but the Dockerfile expects it at the
# build-context root (COPY requirements.txt ./)
cp "$REPO_ROOT/backend/requirements.txt" "$ADDON_DIR/requirements.txt"

echo ""
echo "Done. Build the image with:"
echo "  docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base-python:3.12-alpine3.20 -t cracked-oura:dev $ADDON_DIR"
