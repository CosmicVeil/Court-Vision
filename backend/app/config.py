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

# Per-game stat model (app/ml/game_model.py): one saved file per architecture.
GAME_MODEL_FILE_TEMPLATE = "nba_game_model_{architecture}.pkl"
GAME_MODEL_ARCHITECTURE_ENV = "GAME_MODEL_ARCHITECTURE"
DEFAULT_GAME_MODEL_ARCHITECTURE = "xgboost"
GAME_MODEL_EVALUATION_REPORT_FILE = "game_model_evaluation_report.json"
# Next slate's per-game predictions, written daily by scripts/generate_game_predictions_cache.py.
GAME_PREDICTIONS_CACHE_FILE = "game_predictions_cache.json"

DEFAULT_PORT = 5001
TOKEN_EXPIRY_HOURS = 24

# Browser origins allowed to call /api/* (CORS). Override with a comma-separated CORS_ORIGINS,
# e.g. to add a preview deploy's URL.
DEFAULT_CORS_ORIGINS = (
    'https://courtvision.works',
    'https://www.courtvision.works',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
)

# Rate limits per client IP: (max requests, window in seconds).
LOGIN_RATE_LIMIT = (10, 5 * 60)
SIGNUP_RATE_LIMIT = (5, 60 * 60)


def data_path(filename: str) -> Path:
    return DATA_DIR / filename


def cors_origins() -> list:
    raw = os.environ.get('CORS_ORIGINS', '')
    origins = [origin.strip().rstrip('/') for origin in raw.split(',') if origin.strip()]
    return origins or list(DEFAULT_CORS_ORIGINS)


def trusted_proxy_hops() -> int:
    """How many reverse proxies sit in front of the app and append to X-Forwarded-For.
    On Render a request passes Cloudflare (which appends the client IP) and then Render's proxy
    (which appends the Cloudflare edge IP), so the client is 2 hops from the right. Locally there
    are none, so the client's own header is never trusted. A malformed override falls back."""
    default = 2 if os.environ.get('RENDER') in ('true', '1') else 0
    raw = os.environ.get('TRUSTED_PROXY_HOPS', '').strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        print(f"Ignoring TRUSTED_PROXY_HOPS={raw!r} (not a whole number); using {default}")
        return default


def is_low_memory() -> bool:
    """True on Render (or when LOW_MEMORY is set): serve the static predictions cache
    instead of loading the full model."""
    return (
        os.environ.get('RENDER') in ('true', '1')
        or os.environ.get('LOW_MEMORY') == 'true'
    )
