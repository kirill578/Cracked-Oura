import os
import zipfile
import tempfile
import logging
import pandas as pd
from sqlalchemy.orm import Session
from .base import IngestionBase
from .processors.sleep import SleepProcessor
from .processors.activity import ActivityProcessor
from .processors.readiness import ReadinessProcessor
from .processors.common import CommonProcessor

# Configure Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OuraParser")

# ---------------------------------------------------------------------------
# Zip safety limits
# ---------------------------------------------------------------------------
# Oura's full data export for several years of use is typically 5–30 MB
# compressed, 20–150 MB uncompressed (mostly CSV text).  The limits below
# are generous multiples of those figures so legitimate exports never trip
# them, while zip-bombs and unexpected bulk content are rejected early.

_MAX_ZIP_BYTES       = 500  * 1024 * 1024   # 500 MB on-disk zip
_MAX_TOTAL_BYTES     = 2048 * 1024 * 1024   # 2 GB total uncompressed
_MAX_SINGLE_BYTES    = 512  * 1024 * 1024   # 512 MB per member
_MAX_FILE_COUNT      = 2000                  # max number of members
_MAX_RATIO           = 100                   # compression-ratio red flag
_MIN_RATIO_SIZE      = 1 * 1024 * 1024      # only flag if member > 1 MB
_CHUNK              = 64 * 1024             # read chunk size during extract


def _safe_extract(zip_path: str, dest_dir: str) -> None:
    """Extract a zip archive defensively.

    Protections applied:
    - On-disk zip size cap (reject before opening).
    - Member count cap (reject if > _MAX_FILE_COUNT entries).
    - Per-member declared size cap (from central-directory metadata).
    - Total declared size cap.
    - Compression-ratio check against zip-bomb heuristic.
    - Path-traversal sanitisation — no ``../`` or absolute paths reach disk.
    - Byte-counted chunked extraction — actual bytes written are bounded even
      if the central-directory metadata was falsified.
    """
    # 1. Reject oversized zip before we even open it.
    try:
        zip_size = os.path.getsize(zip_path)
    except OSError as exc:
        raise ValueError(f"Cannot stat zip file: {exc}") from exc

    if zip_size > _MAX_ZIP_BYTES:
        raise ValueError(
            f"ZIP file is too large: {zip_size / 1e6:.1f} MB "
            f"(limit {_MAX_ZIP_BYTES / 1e6:.0f} MB)"
        )

    try:
        zf_handle = zipfile.ZipFile(zip_path, "r")
    except zipfile.BadZipFile as exc:
        raise ValueError(f"Not a valid ZIP file: {exc}") from exc

    with zf_handle as zf:
        members = zf.infolist()

        # 2. Member count.
        if len(members) > _MAX_FILE_COUNT:
            raise ValueError(
                f"ZIP contains {len(members)} entries (limit {_MAX_FILE_COUNT})"
            )

        # 3. Declared-size pre-flight (fast path — reads only metadata).
        total_declared = 0
        for m in members:
            if m.is_dir():
                continue
            if m.file_size > _MAX_SINGLE_BYTES:
                raise ValueError(
                    f"ZIP entry {m.filename!r} declares {m.file_size / 1e6:.1f} MB "
                    f"(limit {_MAX_SINGLE_BYTES / 1e6:.0f} MB per file)"
                )
            total_declared += m.file_size
            if total_declared > _MAX_TOTAL_BYTES:
                raise ValueError(
                    f"ZIP total declared size exceeds {_MAX_TOTAL_BYTES / 1e6:.0f} MB"
                )
            # Compression-ratio heuristic — only meaningful for larger members.
            if m.compress_size > 0 and m.file_size >= _MIN_RATIO_SIZE:
                ratio = m.file_size / m.compress_size
                if ratio > _MAX_RATIO:
                    raise ValueError(
                        f"Suspicious compression ratio ({ratio:.0f}×) for "
                        f"{m.filename!r} — possible zip bomb"
                    )

        # 4. Extract member-by-member with path sanitisation and byte counting.
        dest_real_base = os.path.realpath(dest_dir)
        total_written = 0

        for m in members:
            if m.is_dir():
                continue

            # Normalise separators (Windows zips use backslashes).
            raw_name = m.filename.replace("\\", "/")

            # Reject any entry whose path contains traversal components or is
            # absolute.  We skip rather than sanitise — legitimate Oura exports
            # never need funny paths.
            parts = raw_name.split("/")
            if any(p == ".." for p in parts) or raw_name.startswith("/"):
                logger.warning(
                    f"Path-traversal component detected — skipping: {m.filename!r}"
                )
                continue

            # Rebuild a clean relative path from non-empty, non-dot components.
            clean_parts = [p for p in parts if p and p != "."]
            if not clean_parts:
                logger.warning(f"Skipping empty/root entry: {m.filename!r}")
                continue

            safe_rel = os.path.join(*clean_parts)
            dest_path = os.path.join(dest_dir, safe_rel)

            # Final containment check after os.path.realpath resolution.
            dest_resolved = os.path.realpath(dest_path)
            if not dest_resolved.startswith(dest_real_base + os.sep):
                logger.warning(
                    f"Containment check failed — skipping: {m.filename!r}"
                )
                continue

            os.makedirs(os.path.dirname(dest_resolved), exist_ok=True)

            # Chunked write with live byte counter (catches falsified metadata).
            with zf.open(m) as src, open(dest_resolved, "wb") as dst:
                while True:
                    chunk = src.read(_CHUNK)
                    if not chunk:
                        break
                    total_written += len(chunk)
                    if total_written > _MAX_TOTAL_BYTES:
                        raise ValueError(
                            f"Extraction aborted: actual bytes written exceeded "
                            f"{_MAX_TOTAL_BYTES / 1e6:.0f} MB limit"
                        )
                    dst.write(chunk)

    logger.info(
        f"Extracted {len(members)} members, "
        f"{total_written / 1e6:.2f} MB uncompressed."
    )


class OuraParser(IngestionBase):
    def __init__(self, session: Session):
        super().__init__(session)
        self.sleep_processor = SleepProcessor(session)
        self.activity_processor = ActivityProcessor(session)
        self.readiness_processor = ReadinessProcessor(session)
        self.common_processor = CommonProcessor(session)

    def parse_zip(self, zip_path: str):
        """Extracts ZIP safely and parses all contained CSVs."""
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                _safe_extract(zip_path, temp_dir)
            except (ValueError, zipfile.BadZipFile) as exc:
                logger.error(f"ZIP rejected: {exc}")
                return
            except Exception as exc:
                logger.error(f"Unexpected error extracting ZIP: {exc}")
                return
            
            # Recursively search for a directory containing data files
            target_dir = temp_dir
            found_csvs = []
            for root, dirs, files in os.walk(temp_dir):
                if "dailysleep.csv" in files or "dailyactivity.csv" in files:
                    target_dir = root
                    found_csvs = files
                    break
            
            if not found_csvs:
                 logger.warning("No Oura CSV files found in the ZIP archive!")
            else:
                 logger.info(f"Found data in: {target_dir}")
            
            self.parse_directory(target_dir)

    def parse_directory(self, dir_path: str):
        """Parses all supported CSV files in the directory, merging related files."""
        
        # --- 1. Sleep Data ---
        # Merge dailysleep.csv + sleeptime.csv + dailyspo2.csv
        sleep_df = self._read_csv_robust(os.path.join(dir_path, "dailysleep.csv"))
        sleeptime_df = self._read_csv_robust(os.path.join(dir_path, "sleeptime.csv"))
        spo2_df = self._read_csv_robust(os.path.join(dir_path, "dailyspo2.csv"))
        
        merged_sleep = sleep_df
        
        # Merge sleeptime
        if sleeptime_df is not None and not sleeptime_df.empty:
            if merged_sleep is not None and not merged_sleep.empty:
                if 'day' in merged_sleep.columns and 'day' in sleeptime_df.columns:
                    merged_sleep = pd.merge(merged_sleep, sleeptime_df, on='day', how='outer', suffixes=('', '_time'))
            else:
                merged_sleep = sleeptime_df

        # Merge spo2
        if spo2_df is not None and not spo2_df.empty:
            if merged_sleep is not None and not merged_sleep.empty:
                if 'day' in merged_sleep.columns and 'day' in spo2_df.columns:
                    merged_sleep = pd.merge(merged_sleep, spo2_df, on='day', how='outer', suffixes=('', '_spo2'))
            else:
                merged_sleep = spo2_df

        if merged_sleep is not None and not merged_sleep.empty:
            logger.info("Processing Sleep Data...")
            self.sleep_processor.process_sleep(merged_sleep)

        # --- 2. Readiness Data ---
        # Merge dailyreadiness.csv + dailystress.csv
        readiness_df = self._read_csv_robust(os.path.join(dir_path, "dailyreadiness.csv"))
        stress_df = self._read_csv_robust(os.path.join(dir_path, "dailystress.csv"))

        if readiness_df is not None and not readiness_df.empty:
            if stress_df is not None and not stress_df.empty:
                if 'day' in readiness_df.columns and 'day' in stress_df.columns:
                    merged_readiness = pd.merge(readiness_df, stress_df, on='day', how='outer', suffixes=('', '_stress'))
                    logger.info("Processing Readiness Data...")
                    self.readiness_processor.process_readiness(merged_readiness)
                else:
                    self.readiness_processor.process_readiness(readiness_df)
            else:
                logger.info("Processing Readiness Data...")
                self.readiness_processor.process_readiness(readiness_df)
        elif stress_df is not None and not stress_df.empty:
            logger.info("Processing dailystress.csv as Readiness...")
            self.readiness_processor.process_readiness(stress_df)

        # --- 3. Activity & Other Data ---
        
        # Activity
        act_df = self._read_csv_robust(os.path.join(dir_path, "dailyactivity.csv"))
        if act_df is not None and not act_df.empty:
            logger.info("Processing Activity Data...")
            self.activity_processor.process_activity(act_df)

        # Resilience
        res_df = self._read_csv_robust(os.path.join(dir_path, "dailyresilience.csv"))
        if res_df is not None and not res_df.empty:
            self.readiness_processor.process_resilience(res_df)

        # Stress (Daytime) - Merged into Activity by processor
        day_stress_df = self._read_csv_robust(os.path.join(dir_path, "daytimestress.csv"))
        if day_stress_df is not None and not day_stress_df.empty:
            self.activity_processor.process_stress(day_stress_df)

        # File-based processors
        path_map = {
            "sleepmodel.csv": self.sleep_processor.process_sleep_session,
            "workout.csv": self.activity_processor.process_workout,
            "session.csv": self.activity_processor.process_meditation,
            "heartrate.csv": self.common_processor.process_heart_rate,
            "temperature.csv": self.common_processor.process_temperature,
        }

        for filename, func in path_map.items():
            fpath = os.path.join(dir_path, filename)
            if os.path.exists(fpath):
                logger.info(f"Processing {filename}...")
                func(fpath)

        # DataFrame-based common processors
        common_map = {
            "ringconfiguration.csv": self.common_processor.process_ring_configuration,
            "enhancedtag.csv": self.common_processor.process_tag,
            "dailycardiovascularage.csv": self.common_processor.process_cardiovascular_age,
            "ringbatterylevel.csv": self.common_processor.process_ring_battery,
        }

        for filename, func in common_map.items():
            fpath = os.path.join(dir_path, filename)
            if os.path.exists(fpath):
                df = self._read_csv_robust(fpath)
                if df is not None and not df.empty:
                    func(df)
