ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-python:3.12-alpine3.20

# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first for better layer caching
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --legacy-peer-deps

COPY frontend/ ./
RUN npm run build:web

# ── Stage 2: final image on the HA base ──────────────────────────────────────
FROM $BUILD_FROM

# System packages:
#  - bash + jq for bashio
#  - chromium: system Chromium used by Playwright (pre-baked, no download at runtime)
#  - gcc/musl-dev/libffi-dev/openssl-dev: compile Python native extensions (cryptography, etc.)
RUN apk add --no-cache \
    bash \
    jq \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev

# Point automation.py at the Alpine system Chromium binary.
# CHROMIUM_EXECUTABLE_PATH is our own env var read by automation.py.
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Prevent Playwright from trying to download its own browser bundle.
ENV PLAYWRIGHT_BROWSERS_PATH=0

WORKDIR /app
ENV PYTHONPATH=/app

# Install Python dependencies (includes playwright, fastapi, uvicorn, etc.)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# playwright install-deps is Debian-only; on Alpine we rely on the system
# packages installed above. Run it anyway in case it does something useful,
# but don't fail the build if it errors.
RUN playwright install-deps chromium 2>/dev/null || true

# Application source
COPY backend/ ./backend/

# Built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Add-on entrypoint (run.sh is S6-compatible; CMD is enough for single service)
COPY run.sh /
RUN chmod +x /run.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/automation/status')" \
        || exit 1

CMD ["/run.sh"]
