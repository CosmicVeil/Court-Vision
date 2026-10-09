"""Central configuration: environment flags and data file locations."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
ENV_FILE = BACKEND_DIR / ".env"

NBA_SEASON_DATA_FILE = "nba_2025_26_data.pkl"
MULTI_SEASON_DATA_FILE = "nba_multi_season_data.pkl"
MODEL_FILE = "nba_ai_model.pkl"
MODEL_FILE_ENV = "NBA_MODEL_FILE"
PREDICTIONS_CACHE_FILE = "predictions_cache.json"
UPCOMING_GAMES_CSV_FILE = "nba_upcoming_data.csv"
MODEL_EVALUATION_REPORT_FILE = "model_evaluation_report.json"

DEFAULT_PORT = 5001
TOKEN_EXPIRY_HOURS = 24


def data_path(filename: str) -> Path:
    return DATA_DIR / filename


def is_low_memory() -> bool:
    """True on Render (or when LOW_MEMORY is set): serve the static predictions cache
    instead of loading the full model."""
    return (
        os.environ.get('RENDER') in ('true', '1')
        or os.environ.get('LOW_MEMORY') == 'true'
    )
