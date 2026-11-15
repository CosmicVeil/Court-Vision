"""Training data for the per-game stat model, read from the game archive.

Player history comes from the player_game_features view (app/services/game_archive.py),
whose rolling windows end at the previous game, so nothing here leaks the game being
predicted. The betting line is the closing line, which is known before tip-off. Team
offence, opponent defence and absent teammates are added by game_context_features.py.
"""
from typing import Dict, Iterable

import pandas as pd

from app.ml.game_context_features import (
    APPEARANCE_COLUMNS,
    CONTEXT_FEATURES,
    TEAM_GAME_COLUMNS,
    add_context,
)
from app.services.live_games import TEAM_IDS

# Target stat -> the view column holding the player's average over the previous 10 games.
# That average is also the naive baseline the model has to beat.
TARGETS: Dict[str, str] = {
    "pts": "pts_last10",
    "reb": "reb_last10",
    "ast": "ast_last10",
    "stl": "stl_last10",
    "blk": "blk_last10",
    "tov": "tov_last10",
    "fg3m": "fg3m_last10",
    "minutes": "min_last10",
}
TARGET_COLUMNS = list(TARGETS)
BASELINE_COLUMNS = list(TARGETS.values())

# Columns read straight from the view.
PLAYER_FEATURE_COLUMNS = [
    "is_home", "rest_days", "back_to_back", "games_before",
    "team_spread", "over_under",
    "min_last5", "min_last10", "pts_last5", "pts_last10",
    "reb_last5", "reb_last10", "ast_last5", "ast_last10",
    "stl_last10", "blk_last10", "tov_last10", "fg3m_last10",
    "fga_last10", "fta_last10",
    "pts_season_avg", "reb_season_avg", "ast_season_avg", "min_season_avg",
    "starter_rate_last10",
]
FEATURE_COLUMNS = PLAYER_FEATURE_COLUMNS + CONTEXT_FEATURES

ID_COLUMNS = ["game_id", "espn_player_id", "nba_player_id", "player_name", "team", "opponent", "game_date"]

# A player needs this many earlier games before a row is used: with fewer, the rolling
# averages (and the naive baseline) are too noisy to learn from or to score against.
MIN_PRIOR_GAMES = 5
PRESEASON = 1

_VIEW_COLUMNS = ID_COLUMNS + PLAYER_FEATURE_COLUMNS + TARGET_COLUMNS
_QUERY = f"SELECT {', '.join(_VIEW_COLUMNS)} FROM player_game_features WHERE season_type <> %s"
# Preseason is left out of team form: rotations and effort there say little about the season.
# Public: scripts/generate_game_predictions_cache.py reuses it, so serving reads the same rows.
TEAM_QUERY = (
    f"SELECT {', '.join('t.' + c if c != 'game_date' else 'g.game_date' for c in TEAM_GAME_COLUMNS)} "
    "FROM team_game_stats t JOIN games g USING (game_id) WHERE g.season_type <> %s"
)
# Every box-score row, including players who did not play.
_APPEARANCE_QUERY = f"SELECT {', '.join(APPEARANCE_COLUMNS)} FROM player_game_stats"


def prepare_frame(rows: Iterable[Dict], team_rows: Iterable[Dict] = (),
                  appearance_rows: Iterable[Dict] = ()) -> pd.DataFrame:
    """Turn view rows into a clean, date-sorted frame with float features and targets.

    `team_rows` (team box scores) and `appearance_rows` (every box-score line, including
    did-not-plays) feed the team context columns; without them those columns are NaN.
    Pure function (no database), so tests can feed it synthetic rows.
    """
    frame = pd.DataFrame(list(rows), columns=_VIEW_COLUMNS)
    # Postgres AVG() arrives as Decimal and booleans as bool; models want plain floats.
    for column in PLAYER_FEATURE_COLUMNS + TARGET_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype(float)
    frame["game_date"] = pd.to_datetime(frame["game_date"])
    frame = frame[frame["games_before"] >= MIN_PRIOR_GAMES]
    frame = frame.dropna(subset=TARGET_COLUMNS)
    frame = add_context(frame, team_rows, appearance_rows)
    frame = frame[ID_COLUMNS + FEATURE_COLUMNS + TARGET_COLUMNS]
    return frame.sort_values(["game_date", "game_id", "espn_player_id"]).reset_index(drop=True)


def league_rows(rows: Iterable[Dict]) -> list:
    """Keep only rows where every team involved is one of the 30 NBA teams.

    The archive also holds All-Star games (teams STARS, STRIPES, WORLD, stored as regular
    season) and preseason games against foreign clubs. Those are exhibitions: short
    minutes and no defence, so they are neither predicted nor used as team form.
    """
    return [row for row in rows
            if row["team"] in TEAM_IDS and row.get("opponent", row["team"]) in TEAM_IDS]


def load_training_frame(conn=None) -> pd.DataFrame:
    """Load every archived regular-season and postseason player-game.

    Preseason and All-Star games are not predicted, but they still count towards the
    player's rolling averages, because the view computes those before the filters apply.
    """
    own_connection = conn is None
    if own_connection:
        from app.db import get_db
        conn = get_db()
    try:
        rows = conn.execute(_QUERY, (PRESEASON,)).fetchall()
        team_rows = conn.execute(TEAM_QUERY, (PRESEASON,)).fetchall()
        appearance_rows = conn.execute(_APPEARANCE_QUERY).fetchall()
    finally:
        if own_connection:
            conn.close()
    return prepare_frame(league_rows(rows), league_rows(team_rows), league_rows(appearance_rows))
