"""
Seed the local CrackedOura SQLite database from a folder of Oura CSV exports.

Usage (from project root):
    python -m backend.seed
    python -m backend.seed --data-dir "data/App Data"
    python -m backend.seed --data-dir /path/to/csv/folder --reset

By default it looks for `data/App Data` next to this repo and ingests every
supported CSV in it. It also installs the default dashboard layout
(`oura_dashboard.json`) into the user data directory so the UI has something
to display the moment it boots.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import shutil
from pathlib import Path

# Make sure `backend.*` imports work when run from project root.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.src.database import SessionLocal, init_db, engine, DB_PATH  # noqa: E402
from backend.src.ingestion import OuraParser  # noqa: E402
from backend.src.models import Base  # noqa: E402
from backend.src.paths import get_user_data_dir  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("Seed")


DEFAULT_DATA_DIR = PROJECT_ROOT / "data" / "App Data"
DEFAULT_DASHBOARD_TEMPLATE = PROJECT_ROOT / "oura_dashboard.json"


def reset_database() -> None:
    """Drop & recreate every table so we ingest into a clean DB."""
    logger.info(f"Resetting database at {DB_PATH}")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed_dashboard_config(force: bool = False) -> None:
    """Copy the default dashboard layout into the user data dir if missing."""
    if not DEFAULT_DASHBOARD_TEMPLATE.exists():
        logger.info("No bundled oura_dashboard.json found, skipping dashboard seed.")
        return

    dest = Path(get_user_data_dir()) / "oura_dashboard.json"
    if dest.exists() and not force:
        # Only seed if the existing file has no real dashboards configured.
        try:
            existing = json.loads(dest.read_text())
            dashboards = (existing.get("dashboard") or {}).get("dashboards") or []
            if dashboards:
                logger.info(f"Dashboard config already present at {dest}, leaving it alone.")
                return
        except Exception:
            pass

    shutil.copyfile(DEFAULT_DASHBOARD_TEMPLATE, dest)
    logger.info(f"Seeded default dashboard layout -> {dest}")


def ingest_directory(data_dir: Path) -> None:
    if not data_dir.exists():
        raise FileNotFoundError(
            f"Data directory not found: {data_dir}. "
            f"Place your Oura CSV export there or pass --data-dir."
        )

    csv_count = sum(1 for _ in data_dir.glob("*.csv"))
    if csv_count == 0:
        raise RuntimeError(f"No CSV files found in {data_dir}.")

    logger.info(f"Ingesting {csv_count} CSV files from {data_dir}")
    db = SessionLocal()
    try:
        parser = OuraParser(db)
        parser.parse_directory(str(data_dir))
        logger.info("Ingestion complete.")
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=str(DEFAULT_DATA_DIR),
        help=f"Directory containing Oura CSV files (default: {DEFAULT_DATA_DIR})",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate all tables before ingesting.",
    )
    parser.add_argument(
        "--skip-dashboard",
        action="store_true",
        help="Do not copy the default dashboard layout to the user data dir.",
    )
    parser.add_argument(
        "--force-dashboard",
        action="store_true",
        help="Overwrite an existing dashboard config in the user data dir.",
    )
    args = parser.parse_args(argv)

    init_db()
    if args.reset:
        reset_database()

    if not args.skip_dashboard:
        seed_dashboard_config(force=args.force_dashboard)

    ingest_directory(Path(args.data_dir))
    logger.info(f"Database ready at {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
