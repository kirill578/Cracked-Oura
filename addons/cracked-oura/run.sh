#!/usr/bin/env bash
set -euo pipefail

OPTIONS="${CONFIG_PATH:-/data/options.json}"

# Helper: read a key from options.json with a fallback default
_opt() { jq -r ".$1 // \"$2\"" "$OPTIONS"; }

export HA_ADDON=1
export PORT="$(_opt port 8000)"
export LOG_LEVEL="$(_opt log_level info)"
export LLM_HOST="$(_opt llm_host 'http://localhost:11434')"
export LLM_MODEL="$(_opt llm_model 'llama3.1:latest')"
export TELEGRAM_BOT_TOKEN="$(_opt telegram_bot_token '')"
export TELEGRAM_CHAT_ID="$(_opt telegram_chat_id '')"

echo "Starting Cracked Oura"
echo "Port:      ${PORT}"
echo "LLM host:  ${LLM_HOST}"
echo "LLM model: ${LLM_MODEL}"

exec python -m backend.src.api.main
