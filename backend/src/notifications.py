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
from typing import Optional
from datetime import date

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Sleep, Activity, Readiness, SleepSession

logger = logging.getLogger("Notifications")

_TELEGRAM_URL = "https://api.telegram.org/bot{token}/sendMessage"


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
    """
    latest_day: Optional[date] = db.query(func.max(Sleep.day)).scalar()
    if latest_day is None:
        logger.warning("No sleep data found — skipping notification.")
        return None

    day_label = f"{latest_day.strftime('%a %b')} {latest_day.day}"  # e.g. "Mon Jan 19"

    sleep_row = db.query(Sleep).filter(Sleep.day == latest_day).first()
    activity_row = db.query(Activity).filter(Activity.day == latest_day).first()
    readiness_row = db.query(Readiness).filter(Readiness.day == latest_day).first()

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
