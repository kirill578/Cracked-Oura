ARG BUILD_FROM=python:3.12-slim-bookworm

# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --prefer-offline --legacy-peer-deps

COPY frontend/ ./
RUN npm run build:web

# ── Stage 2: final runtime image (Debian — required for playwright/glibc) ────
FROM $BUILD_FROM

# Add-on version, plumbed through CI from addons/cracked-oura/config.yaml so
# the running container can report it (used by /api/version + UI footer to
# verify users actually got the new image after an update).
ARG VERSION=dev
ENV CRACKED_OURA_VERSION=$VERSION

# Chromium + runtime fonts + jq (for parsing /data/options.json in run.sh)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Point automation.py at the Debian system Chromium
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# Prevent Playwright from downloading its own browser bundle
ENV PLAYWRIGHT_BROWSERS_PATH=0

WORKDIR /app
ENV PYTHONPATH=/app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Let playwright install any missing OS deps it knows about for Debian
RUN playwright install-deps chromium 2>/dev/null || true

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

COPY run.sh /
RUN chmod +x /run.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/automation/status')" \
        || exit 1

CMD ["/run.sh"]
