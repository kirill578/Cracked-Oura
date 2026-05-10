"""Telegram notification support.

After each successful ingestion the backend queries the most recently
available day from the local DB and sends a compact summary message:

    📊 Oura Daily Summary — Mon Jan 19

    Scores
    🟡 Sleep       54
    🟢 Readiness   74
    🔴 Activity    33

    👟 Steps: 8,432

    😴 Sleep: 6h 12m
      🔵 Deep   1h 12m
      🟣 REM    0h 42m
      ⚪ Light   4h 18m
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import date

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Sleep, Activity, Readiness, SleepSession

logger = logging.getLogger("Notifications")

_TELEGRAM_URL = "https://api.telegram.org/bot{token}/sendMessage"
_TELEGRAM_GET_ME = "https://api.telegram.org/bot{token}/getMe"
_TELEGRAM_GET_UPDATES = "https://api.telegram.org/bot{token}/getUpdates"


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _fmt_dur(seconds: Optional[int]) -> str:
    """Converts seconds → 'Xh YYm', or '—' if unknown."""
    if seconds is None:
        return "—"
    total_min = round(seconds / 60)
    h, m = divmod(total_min, 60)
    return f"{h}h {m:02d}m"


def _score_emoji(score: Optional[int]) -> str:
    if score is None:
        return "⚪"
    if score >= 70:
        return "🟢"
    if score >= 50:
        return "🟡"
    return "🔴"


def _score_line(label: str, score: Optional[int]) -> str:
    emoji = _score_emoji(score)
    val = str(score) if score is not None else "—"
    return f"{emoji} {label:<12}{val}"


# ---------------------------------------------------------------------------
# Message builder
# ---------------------------------------------------------------------------

def build_summary(db: Session) -> Optional[str]:
    """Queries the most recent day in the DB and returns the Telegram message text.

    Returns None when there's no data yet (fresh install before first sync).

    Day semantics:
      * ``latest_day`` is the most recent ``Sleep.day``, i.e. the morning the
        user just woke up. Sleep score, readiness score, and the sleep
        session (deep/REM/light) all describe *that* night's sleep.
      * Activity/steps for ``latest_day``, however, only cover the few
        morning hours since waking — they're partial and misleading. The
        user wants to see *yesterday's full-day* steps under the
        "Yesterday's steps" label, so we pull the most recent activity row
        strictly before ``latest_day``. We do not use ``latest_day - 1``
        directly because there can be ingestion gaps (missed days, ring on
        charger, etc.).
    """
    latest_day: Optional[date] = db.query(func.max(Sleep.day)).scalar()
    if latest_day is None:
        logger.warning("No sleep data found — skipping notification.")
        return None

    day_label = f"{latest_day.strftime('%a %b')} {latest_day.day}"  # e.g. "Mon Jan 19"

    sleep_row = db.query(Sleep).filter(Sleep.day == latest_day).first()
    readiness_row = db.query(Readiness).filter(Readiness.day == latest_day).first()

    # Yesterday's full-day activity. Falling back to the latest *complete*
    # day before the user's wake-up day avoids reporting "0 steps" or a tiny
    # partial number when the morning's activity row exists but is empty.
    activity_row = (
        db.query(Activity)
        .filter(Activity.day < latest_day)
        .order_by(Activity.day.desc())
        .first()
    )

    # Prefer the longest 'sleep' type session; fall back to any session.
    session = (
        db.query(SleepSession)
        .filter(SleepSession.day == latest_day, SleepSession.type == "sleep")
        .order_by(SleepSession.total_sleep_duration.desc())
        .first()
    )
    if session is None:
        session = (
            db.query(SleepSession)
            .filter(SleepSession.day == latest_day)
            .order_by(SleepSession.total_sleep_duration.desc())
            .first()
        )

    sleep_score = sleep_row.score if sleep_row else None
    readiness_score = readiness_row.score if readiness_row else None
    activity_score = activity_row.score if activity_row else None
    steps = activity_row.steps if activity_row else None

    total_sleep = session.total_sleep_duration if session else None
    deep = session.deep_sleep_duration if session else None
    rem = session.rem_sleep_duration if session else None
    light = session.light_sleep_duration if session else None

    steps_str = f"{steps:,}" if steps is not None else "—"

    lines = [
        f"📊 *Oura Daily Summary — {day_label}*",
        "",
        "*Scores*",
        f"`{_score_line('Sleep', sleep_score)}`",
        f"`{_score_line('Readiness', readiness_score)}`",
        f"`{_score_line('Activity', activity_score)}`",
        "",
        f"👟 Yesterday's steps: *{steps_str}*",
        "",
        f"😴 Sleep: *{_fmt_dur(total_sleep)}*",
        f"  🔵 Deep   {_fmt_dur(deep)}",
        f"  🟣 REM    {_fmt_dur(rem)}",
        f"  ⚪ Light   {_fmt_dur(light)}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Chat discovery (getUpdates)
# ---------------------------------------------------------------------------

def _telegram_chat_title(chat: Dict[str, Any]) -> str:
    ctype = chat.get("type") or ""
    if ctype == "private":
        parts = [chat.get("first_name") or "", chat.get("last_name") or ""]
        name = " ".join(p for p in parts if p).strip()
        un = chat.get("username")
        if name and un:
            return f"{name} (@{un})"
        if un:
            return f"@{un}"
        return name or "Private chat"
    return chat.get("title") or chat.get("username") or "Chat"


def _message_preview(message: Dict[str, Any]) -> str:
    text = message.get("text") or message.get("caption")
    if text:
        t = text.strip().replace("\n", " ")
        return t if len(t) <= 160 else t[:157] + "…"
    if message.get("sticker"):
        return "[sticker]"
    if message.get("photo"):
        return "[photo]"
    if message.get("document"):
        return "[document]"
    if message.get("voice"):
        return "[voice]"
    if message.get("video"):
        return "[video]"
    if message.get("poll"):
        return "[poll]"
    return "[message]"


def _message_from_update(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    for key in ("message", "edited_message", "channel_post", "edited_channel_post"):
        if key in update:
            return update[key]
    return None


async def telegram_discover_chats(bot_token: str) -> dict:
    """Call Telegram ``getMe`` and ``getUpdates`` to list chats the bot recently heard from.

    Returns ``{"ok": True, "bot": {...}, "chats": [...]}`` or ``{"ok": False, "error": "..."}``.
    """
    token = bot_token.strip()
    if not token:
        return {"ok": False, "error": "Bot token is required"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            me_resp = await client.get(_TELEGRAM_GET_ME.format(token=token))
            me_data = me_resp.json()
            if not me_data.get("ok"):
                return {"ok": False, "error": me_data.get("description", "Invalid bot token")}

            bot = me_data.get("result") or {}
            username = bot.get("username")
            bot_info = {
                "first_name": bot.get("first_name") or "Bot",
                "username": username,
                "open_link": f"https://t.me/{username}" if username else None,
            }

            up_resp = await client.get(
                _TELEGRAM_GET_UPDATES.format(token=token),
                params={"limit": 100, "timeout": 0},
            )
            up_data = up_resp.json()
            if not up_data.get("ok"):
                err = up_data.get("description", "getUpdates failed")
                # Webhook active → long-polling disabled
                if up_resp.status_code == 409 or "webhook" in err.lower():
                    return {
                        "ok": False,
                        "error": (
                            "This bot has a webhook configured, so pending messages cannot be "
                            "listed here. Remove the webhook in BotFather or enter the chat ID manually."
                        ),
                    }
                return {"ok": False, "error": err}

            # Latest message per chat (by highest update_id)
            by_chat: Dict[str, Dict[str, Any]] = {}
            for update in up_data.get("result") or []:
                uid = update.get("update_id")
                if uid is None:
                    continue
                msg = _message_from_update(update)
                if not msg:
                    continue
                chat = msg.get("chat") or {}
                cid = chat.get("id")
                if cid is None:
                    continue
                cid_str = str(cid)
                prev = by_chat.get(cid_str)
                if prev is None or int(uid) > int(prev["update_id"]):
                    by_chat[cid_str] = {
                        "update_id": uid,
                        "chat_id": cid_str,
                        "title": _telegram_chat_title(chat),
                        "chat_type": chat.get("type") or "",
                        "last_message_preview": _message_preview(msg),
                    }

            chats: List[Dict[str, Any]] = sorted(
                by_chat.values(),
                key=lambda row: int(row["update_id"]),
                reverse=True,
            )
            for row in chats:
                row.pop("update_id", None)

            out = {"ok": True, "bot": bot_info, "chats": chats}
            if not chats:
                out["hint"] = (
                    "No messages received yet. Open your bot in Telegram, send any message "
                    "(e.g. “hello”), then click again."
                )
            return out
    except Exception as exc:
        logger.error(f"Telegram discover failed: {exc}")
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Sender
# ---------------------------------------------------------------------------

async def send_telegram_summary(bot_token: str, chat_id: str, db: Session) -> dict:
    """Builds and delivers the daily summary via the Telegram Bot API.

    Returns ``{"ok": True}`` on success or ``{"ok": False, "error": "..."}`` on failure.
    Failures are logged but never raised — callers should treat them as best-effort.
    """
    if not bot_token or not chat_id:
        return {"ok": False, "error": "bot_token or chat_id not configured"}

    text = build_summary(db)
    if text is None:
        return {"ok": False, "error": "No data available yet"}

    url = _TELEGRAM_URL.format(token=bot_token)
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if data.get("ok"):
                logger.info("Telegram notification sent successfully.")
                return {"ok": True}
            logger.error(f"Telegram API error: {data}")
            return {"ok": False, "error": data.get("description", "Unknown Telegram error")}
    except Exception as exc:
        logger.error(f"Telegram send failed: {exc}")
        return {"ok": False, "error": str(exc)}
