#!/usr/bin/with-contenv bashio

export HA_ADDON=1
export PORT="$(bashio::config 'port')"
export LOG_LEVEL="$(bashio::config 'log_level')"
export LLM_HOST="$(bashio::config 'llm_host')"
export LLM_MODEL="$(bashio::config 'llm_model')"

# Optional fields — only export when the user actually provided a value
export TELEGRAM_BOT_TOKEN=""
export TELEGRAM_CHAT_ID=""
if bashio::config.has_value 'telegram_bot_token'; then
    export TELEGRAM_BOT_TOKEN="$(bashio::config 'telegram_bot_token')"
fi
if bashio::config.has_value 'telegram_chat_id'; then
    export TELEGRAM_CHAT_ID="$(bashio::config 'telegram_chat_id')"
fi

bashio::log.info "Starting Cracked Oura"
bashio::log.info "Port:      ${PORT}"
bashio::log.info "LLM host:  ${LLM_HOST}"
bashio::log.info "LLM model: ${LLM_MODEL}"

exec python -m backend.src.api.main
