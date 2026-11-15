"""Predict every player's line for the next slate of games and write data/game_predictions_cache.json.

Run from backend/:  python scripts/generate_game_predictions_cache.py [--arch xgboost] [--date YYYY-MM-DD]
Needs DATABASE_URL (game archive) and a trained model (scripts/train_game_model.py).

The slate is the first day, from --date (default: today, US Eastern) up to a week ahead,
that has games not yet started. Ruled-out players come from ESPN's injury report.
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app import config
from app.ml import game_architectures
from app.ml.game_context_features import APPEARANCE_COLUMNS
from app.ml.game_features import PRESEASON, TEAM_QUERY, league_rows
from app.ml.game_model import GameStatModel, model_file
from app.ml.game_upcoming import HISTORY_COLUMNS, build_upcoming_frame
from app.services import injuries, live_games
from app.services.game_predictions import build_cache, parse_scoreboard_event

LOOKAHEAD_DAYS = 7
_ET = ZoneInfo("America/New_York")


def write_json_atomically(path, data):
    """Write JSON to a temp file beside `path`, then rename it into place.

    A running API re-reads the cache when its mtime changes (app.state.current_game_predictions);
    os.replace swaps the whole file at once, so it never sees a half-written one. The temp file
    must be in the same folder: a rename is only atomic within one filesystem."""
    path = Path(path)
    fd, temp_path = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            json.dump(data, handle, indent=1)
        os.replace(temp_path, path)
    except BaseException:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


def find_slate(start: date):
    """(slate date, games) for the first day with unstarted games, or (None, [])."""
    for offset in range(LOOKAHEAD_DAYS + 1):
        day = start + timedelta(days=offset)
        data = live_games._get(live_games._SCOREBOARD, params={"dates": day.strftime("%Y%m%d")}) or {}
        games = [game for game in map(parse_scoreboard_event, data.get("events", [])) if game]
        if games:
            for game in games:
                game["game_date"] = day
            return day, games
    return None, []


def load_archive(conn, before: date):
    """Everything archived before the slate, with the same filters as training (game_features)."""
    # One read of player_game_stats feeds both the player history and the absence rows.
    columns = HISTORY_COLUMNS + [c for c in APPEARANCE_COLUMNS if c not in HISTORY_COLUMNS]
    rows = conn.execute(
        f"SELECT {', '.join(columns)} FROM player_game_stats WHERE game_date < %s", (before,)).fetchall()
    team_rows = conn.execute(f"{TEAM_QUERY} AND g.game_date < %s", (PRESEASON, before)).fetchall()
    appearances = [{column: row[column] for column in APPEARANCE_COLUMNS} for row in rows]
    return rows, league_rows(team_rows), league_rows(appearances)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Write the per-game predictions cache.")
    parser.add_argument("--arch", choices=game_architectures.available(),
                        default=game_architectures.default_architecture(), help="model architecture")
    parser.add_argument("--date", type=date.fromisoformat, help="first day to look for games (default: today ET)")
    args = parser.parse_args(argv)

    model = GameStatModel.load(model_file(args.arch))
    slate_date, games = find_slate(args.date or datetime.now(_ET).date())
    if not games:
        print(f"No unstarted games in the next {LOOKAHEAD_DAYS} days; cache left unchanged.")
        return 0

    from app.db import get_db
    conn = get_db()
    try:
        history, team_rows, appearances = load_archive(conn, slate_date)
    finally:
        conn.close()

    frame = build_upcoming_frame(games, history, team_rows, appearances, injuries.get_injuries())
    predictions = model.predict(frame) if len(frame) else frame
    report_path = config.data_path(config.GAME_MODEL_EVALUATION_REPORT_FILE)
    report = json.loads(report_path.read_text()) if report_path.exists() else None
    output = config.data_path(config.GAME_PREDICTIONS_CACHE_FILE)
    previous = json.loads(output.read_text()) if output.exists() else None
    cache = build_cache(slate_date.isoformat(), games, frame, predictions, model, report, previous=previous)

    write_json_atomically(output, cache)
    print(f"Predicted {len(cache['players'])} players across {len(games)} games on {slate_date} "
          f"with {args.arch}; wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
