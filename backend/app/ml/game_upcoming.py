"""Feature rows for games that have not been played yet, so the per-game model can predict them.

Training rows come from the player_game_features view, whose rolling windows end at the
previous game. For an upcoming game the "previous game" is simply the player's latest
archived one, so the same windows are computed here in pandas over everything archived
before the slate date. Team context reuses game_context_features.add_context() unchanged:
each upcoming game gets a placeholder team row (no stats), so its shift-then-roll window
ends at the team's latest game, and each player ruled out on the injury report gets a
synthetic did-not-play row, which is exactly how training sees an absence.

A run can cover several days (scripts/generate_game_predictions_cache.py predicts the next few
game days). Rolling form is as of the first day for every game: a later game's windows cannot
include the earlier games in the window, because they have not been played. Rest is per game,
though: a team's earlier game in the window counts as the player's previous game, so a
scheduled back-to-back is flagged as one.

Pure functions only (no database, no network): scripts/generate_game_predictions_cache.py
loads the rows and calls build_upcoming_frame().
"""
from datetime import date
from typing import Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

from app.ml.game_context_features import ABSENCE_FEATURES, TEAM_GAME_COLUMNS, add_context
from app.ml.game_features import FEATURE_COLUMNS, ID_COLUMNS, MIN_PRIOR_GAMES, PLAYER_FEATURE_COLUMNS
from app.services.live_games import TEAM_IDS

# Columns of player_game_stats needed to rebuild the view's rolling features.
HISTORY_COLUMNS = [
    "game_id", "espn_player_id", "nba_player_id", "player_name", "position", "team",
    "game_date", "season", "starter", "did_not_play", "minutes",
    "pts", "reb", "ast", "stl", "blk", "tov", "fg3m", "fga", "fta",
]
# A player counts as on his team's active roster only if he played within this many days.
# Longer absences show up through the injury report instead.
ACTIVE_WITHIN_DAYS = 30
# ...and only if he played in at least one of his team's last ROTATION_GAMES games. The model
# only ever saw games a player actually played, so deep-bench players who usually sit would get
# projections it was never trained to make. Measured on 10 archived days: keeps 96% of the
# players who then played, and the share of predicted players who play rises from 66% to 76%.
ROTATION_GAMES = 3
# Injury statuses that mean the player will not play. Training only knows who actually sat,
# so a "Questionable" player is predicted (and flagged) rather than guessed out.
OUT_STATUSES = {"out", "suspension"}
# Stand-in DNP reason for a ruled-out player, so absence_totals() treats him like training does.
INJURY_DNP_REASON = "INJURY"

_LAST5 = ["min", "pts", "reb", "ast"]
_LAST10 = ["min", "pts", "reb", "ast", "stl", "blk", "tov", "fg3m", "fga", "fta"]
_SEASON = ["pts", "reb", "ast", "min"]


def _played(history: Iterable[Dict], before: date) -> pd.DataFrame:
    """Rows the view would keep (played, minutes > 0), dated before the slate, oldest first."""
    frame = pd.DataFrame(list(history), columns=HISTORY_COLUMNS)
    frame["game_date"] = pd.to_datetime(frame["game_date"])
    for column in ["minutes", "pts", "reb", "ast", "stl", "blk", "tov", "fg3m", "fga", "fta"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype(float)
    # == False, not != True: the view's `NOT did_not_play` drops NULL rows too.
    frame = frame[(frame["did_not_play"] == False) & (frame["minutes"] > 0)  # noqa: E712
                  & (frame["game_date"] < pd.Timestamp(before))]
    frame = frame.rename(columns={"minutes": "min"})
    return frame.sort_values(["espn_player_id", "game_date", "game_id"]).reset_index(drop=True)


def player_form(history: Iterable[Dict], slate_date: date, season: int) -> pd.DataFrame:
    """One row per player: the view's rolling features as they stand before `slate_date`.

    Matches player_game_features: last-5/10 means over the latest played games, season
    averages over this season's played games, rest days since the latest game, and
    games_before counting every archived game played (all seasons and season types).
    """
    played = _played(history, slate_date)
    if played.empty:
        return pd.DataFrame(columns=["espn_player_id", "nba_player_id", "player_name", "position",
                                     "team", "last_played", "in_rotation", *PLAYER_FEATURE_COLUMNS])
    by_player = played.groupby("espn_player_id", sort=False)
    last10 = by_player.tail(10).groupby("espn_player_id")
    last5 = by_player.tail(5).groupby("espn_player_id")
    latest = by_player.tail(1).set_index("espn_player_id")

    form = pd.DataFrame(index=latest.index)
    for column in ("nba_player_id", "player_name", "position"):
        form[column] = latest[column]
    # His team is the one from his latest league game: an All-Star game says nothing about it.
    league = played[played["team"].isin(TEAM_IDS)]
    form["team"] = league.groupby("espn_player_id").tail(1).set_index("espn_player_id")["team"]
    # Date of the team's ROTATION_GAMES-th most recent game: playing on or after it = in the rotation.
    cutoff = league.groupby("team")["game_date"].apply(lambda dates: dates.drop_duplicates().nlargest(ROTATION_GAMES).min())
    # Players with no league game at all (exhibitions only) get NaT, which compares False.
    last_league_game = league.groupby("espn_player_id")["game_date"].max().reindex(form.index)
    form["in_rotation"] = last_league_game >= form["team"].map(cutoff)
    form["last_played"] = latest["game_date"]
    form["games_before"] = by_player.size().astype(float)
    form["rest_days"] = (pd.Timestamp(slate_date) - latest["game_date"]).dt.days.astype(float)
    form["back_to_back"] = (form["rest_days"] == 1).astype(float)
    for stat in _LAST5:
        form[f"{stat}_last5"] = last5[stat].mean()
    for stat in _LAST10:
        form[f"{stat}_last10"] = last10[stat].mean()
    # SQL AVG skips NULLs, and so does mean(); a missing starter flag is left out, not counted 0.
    form["starter_rate_last10"] = last10["starter"].apply(lambda values: values.map({True: 1.0, False: 0.0}).mean())
    this_season = played[played["season"] == season].groupby("espn_player_id")
    for stat in _SEASON:
        form[f"{stat}_season_avg"] = this_season[stat].mean()
    return form.reset_index()


def _absent_players(injuries: Dict[int, Dict], form: pd.DataFrame, teams: set) -> List[Dict]:
    """Ruled-out players on the slate's teams, with the ESPN ID the archive keys them by."""
    espn_by_nba = dict(zip(form["nba_player_id"].dropna().astype(int), form["espn_player_id"]))
    team_by_espn = dict(zip(form["espn_player_id"], form["team"]))
    absent = []
    for nba_id, entry in (injuries or {}).items():
        if str(entry.get("status", "")).strip().lower() not in OUT_STATUSES:
            continue
        espn_id = entry.get("espnId") or espn_by_nba.get(int(nba_id))
        team = entry.get("team") or team_by_espn.get(espn_id)
        if espn_id and team in teams:
            absent.append({"espn_player_id": int(espn_id), "nba_player_id": int(nba_id), "team": team})
    return absent


def build_upcoming_frame(games: List[Dict], history: Iterable[Dict], team_rows: Iterable[Dict],
                         appearance_rows: Iterable[Dict], injuries: Optional[Dict[int, Dict]] = None,
                         season: Optional[int] = None) -> pd.DataFrame:
    """One row per (upcoming game, rostered player) with ID_COLUMNS + FEATURE_COLUMNS,
    ready for GameStatModel.predict(), plus `position` and `injury` for display.

    games: [{"game_id", "game_date" (date), "home", "away", "spread" (home view), "over_under"}].
    history / appearance_rows: player_game_stats rows (HISTORY_COLUMNS / APPEARANCE_COLUMNS).
    team_rows: team_game_stats rows (TEAM_GAME_COLUMNS), league teams only.
    injuries: app.services.injuries report, keyed by NBA.com ID.
    """
    columns = ID_COLUMNS + FEATURE_COLUMNS + ["position", "injury"]
    if not games:
        return pd.DataFrame(columns=columns)
    history = list(history)
    injuries = injuries or {}
    slate_date = min(game["game_date"] for game in games)
    if season is None:
        from app.services.game_archive import current_season_year
        season = current_season_year(slate_date)

    form = player_form(history, slate_date, season)
    teams = {game[side] for game in games for side in ("home", "away")}
    absent = _absent_players(injuries, form, teams)
    absent_ids = {player["espn_player_id"] for player in absent}

    # Each team's game dates in the window, for rest days measured from its previous scheduled game.
    schedule = {}
    for game in games:
        for side in ("home", "away"):
            schedule.setdefault(game[side], []).append(pd.Timestamp(game["game_date"]))

    rows, placeholders, synthetic_dnps = [], [], []
    for game in games:
        game_date = pd.Timestamp(game["game_date"])
        spread = _float(game.get("spread"))
        for team, opponent, is_home in ((game["home"], game["away"], True), (game["away"], game["home"], False)):
            placeholders.append({"game_id": game["game_id"], "team": team, "opponent": opponent,
                                 "game_date": game["game_date"]})
            roster = form[(form["team"] == team)
                          & ((game_date - form["last_played"]).dt.days <= ACTIVE_WITHIN_DAYS)
                          & (form["games_before"] >= MIN_PRIOR_GAMES)
                          & form["in_rotation"]
                          & ~form["espn_player_id"].isin(absent_ids)]
            earlier = [day for day in schedule[team] if day < game_date]
            for player in roster.to_dict("records"):
                rest = _rest(player, game_date, earlier)
                nba_id = player["nba_player_id"]
                nba_id = int(nba_id) if pd.notna(nba_id) else None
                injury = injuries.get(nba_id) if nba_id is not None else None
                rows.append({
                    **{column: player[column] for column in PLAYER_FEATURE_COLUMNS
                       if column in player and column not in ("is_home", "team_spread", "over_under")},
                    "game_id": game["game_id"], "espn_player_id": int(player["espn_player_id"]),
                    "nba_player_id": nba_id, "player_name": player["player_name"],
                    "team": team, "opponent": opponent, "game_date": game_date,
                    "is_home": float(is_home),
                    # Counting the window's earlier games as played, as the player is expected to.
                    "games_before": player["games_before"] + len(earlier),
                    "rest_days": rest, "back_to_back": float(rest == 1),
                    "team_spread": (spread if is_home else -spread) if spread is not None else np.nan,
                    "over_under": _float(game.get("over_under")),
                    "position": player["position"],
                    "injury": injury,
                })
        for player in absent:
            if player["team"] in (game["home"], game["away"]):
                synthetic_dnps.append({"game_id": game["game_id"], "espn_player_id": player["espn_player_id"],
                                       "team": player["team"], "game_date": game["game_date"],
                                       "did_not_play": True, "dnp_reason": INJURY_DNP_REASON,
                                       "minutes": None, "pts": None})

    frame = pd.DataFrame(rows, columns=ID_COLUMNS + PLAYER_FEATURE_COLUMNS + ["position", "injury"])
    if frame.empty:
        return pd.DataFrame(columns=columns)
    for column in PLAYER_FEATURE_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype(float)
    team_rows = list(team_rows) + [{**row, **{c: None for c in TEAM_GAME_COLUMNS if c not in row}}
                                   for row in placeholders]
    appearance_rows = list(appearance_rows) + synthetic_dnps
    frame = add_context(frame, team_rows, appearance_rows)
    # Training games always have box-score rows, so "nobody out" is 0 there, not missing.
    frame[ABSENCE_FEATURES] = frame[ABSENCE_FEATURES].fillna(0.0)
    return frame[columns].sort_values(["game_date", "game_id", "team", "player_name"]).reset_index(drop=True)


def _rest(player: Dict, game_date: pd.Timestamp, earlier: List[pd.Timestamp]) -> float:
    """Days since the player's previous game: his team's latest earlier game in the window, if
    any, else his latest archived one (player_form's rest_days is measured to the first day)."""
    previous = max(earlier) if earlier else player["last_played"]
    return float((game_date - previous).days)


def _float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
