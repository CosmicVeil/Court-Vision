"""Team-level context for the per-game stat model: how the player's team has been
scoring, how the opponent has been defending, and how many rotation minutes are sitting out.

Pure pandas, no database: game_features.py loads the rows and calls add_context().

Leakage rules followed here:
- Team form is a rolling mean over the team's *previous* games (shift before rolling).
- An absent player's weight (his usual minutes and points) comes from his earlier games.
- Who is absent is taken from the box score's did-not-play reason. Injuries, rest and
  suspensions are announced before tip-off; a coach's decision is not, so it is ignored.
"""
import numpy as np
import pandas as pd

WINDOW = 10
# A team needs this many earlier games before its rolling form means anything.
MIN_TEAM_GAMES = 3
# An absent player who last played within this many days counts as "recently" out: his
# teammates' own rolling averages have not yet adjusted to playing without him.
RECENT_ABSENCE_DAYS = 14
# Free throws that end a possession, the usual estimate.
FREE_THROW_POSSESSION_WEIGHT = 0.44

TEAM_GAME_COLUMNS = [
    "game_id", "team", "opponent", "game_date",
    "pts", "fgm", "fga", "fg3m", "fta", "oreb", "reb", "ast", "blk", "tov",
]
APPEARANCE_COLUMNS = [
    "game_id", "espn_player_id", "team", "game_date",
    "did_not_play", "dnp_reason", "minutes", "pts",
]

# Rolling column -> per-game column it averages. "for" = what the team does itself,
# "against" = what it lets opponents do.
_FOR = {
    "pts_last10": "pts", "pace_last10": "pace", "off_rating_last10": "off_rating",
    "efg_last10": "efg", "ast_last10": "ast", "reb_last10": "reb",
    "fg3m_last10": "fg3m", "tov_last10": "tov",
}
_AGAINST = {
    "pts_allowed_last10": "opp_pts", "def_rating_last10": "def_rating",
    "efg_allowed_last10": "opp_efg", "reb_allowed_last10": "opp_reb",
    "ast_allowed_last10": "opp_ast", "fg3m_allowed_last10": "opp_fg3m",
    "tov_forced_last10": "opp_tov", "blk_allowed_last10": "opp_blk",
}

# The player's own team: its offence.
TEAM_FEATURES = [f"team_{name}" for name in _FOR]
# The opponent: its defence, plus its pace and its own turnovers (steal chances).
OPPONENT_FEATURES = [f"opp_{name}" for name in _AGAINST] + ["opp_pace_last10", "opp_tov_last10"]
ABSENCE_FEATURES = ["team_missing_min", "team_missing_pts", "team_missing_min_recent", "opp_missing_min"]
CONTEXT_FEATURES = TEAM_FEATURES + OPPONENT_FEATURES + ABSENCE_FEATURES

_KEY = ["game_id", "team"]


def _numeric(frame, columns):
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype(float)
    return frame


def _ratio(numerator, denominator):
    return numerator / denominator.where(denominator > 0)


def team_form(team_rows) -> pd.DataFrame:
    """One row per (game_id, team): rolling means over the team's previous games."""
    games = pd.DataFrame(list(team_rows), columns=TEAM_GAME_COLUMNS)
    stats = [column for column in TEAM_GAME_COLUMNS if column not in ("game_id", "team", "opponent", "game_date")]
    games = _numeric(games, stats)
    games["game_date"] = pd.to_datetime(games["game_date"])
    games = games.drop_duplicates(_KEY)

    # Put the other team's box score on the same row, to know what was allowed.
    other = games[_KEY + stats].rename(
        columns={"team": "opponent", **{column: f"opp_{column}" for column in stats}})
    games = games.merge(other, on=["game_id", "opponent"], how="left")

    for prefix in ("", "opp_"):
        games[f"{prefix}poss"] = (
            games[f"{prefix}fga"] + FREE_THROW_POSSESSION_WEIGHT * games[f"{prefix}fta"]
            - games[f"{prefix}oreb"] + games[f"{prefix}tov"]
        )
        games[f"{prefix}efg"] = _ratio(
            games[f"{prefix}fgm"] + 0.5 * games[f"{prefix}fg3m"], games[f"{prefix}fga"])
    games["pace"] = (games["poss"] + games["opp_poss"]) / 2
    games["off_rating"] = 100 * _ratio(games["pts"], games["poss"])
    games["def_rating"] = 100 * _ratio(games["opp_pts"], games["opp_poss"])

    games = games.sort_values(["team", "game_date", "game_id"]).reset_index(drop=True)
    form = games[_KEY].copy()
    by_team = games.groupby("team", sort=False)
    for name, source in {**_FOR, **_AGAINST}.items():
        # shift(1) first, so the window ends at the previous game.
        form[name] = by_team[source].transform(
            lambda values: values.shift(1).rolling(WINDOW, min_periods=MIN_TEAM_GAMES).mean())
    return form


def absence_totals(appearance_rows) -> pd.DataFrame:
    """One row per (game_id, team): usual minutes and points of the players sitting out."""
    rows = pd.DataFrame(list(appearance_rows), columns=APPEARANCE_COLUMNS)
    rows = _numeric(rows, ["minutes", "pts"])
    rows["game_date"] = pd.to_datetime(rows["game_date"])
    rows = rows.drop_duplicates(["game_id", "espn_player_id"])
    rows = rows.sort_values(["espn_player_id", "game_date", "game_id"]).reset_index(drop=True)

    played = (rows["did_not_play"] != True) & (rows["minutes"] > 0)  # noqa: E712 (None-safe)
    by_player = rows["espn_player_id"]

    def usual(column):
        # Mean over the player's last WINDOW games *played*, as known before this game:
        # rolling over played rows only, carried forward over missed games, then shifted
        # one row so the current game is excluded.
        after_game = rows.loc[played, column].groupby(by_player[played]).transform(
            lambda values: values.rolling(WINDOW, min_periods=1).mean())
        after_game = after_game.reindex(rows.index)  # NaN on the games he missed
        return after_game.groupby(by_player).ffill().groupby(by_player).shift(1)

    usual_min, usual_pts = usual("minutes"), usual("pts")
    last_played = rows["game_date"].where(played).groupby(by_player).ffill().groupby(by_player).shift(1)
    days_out = (rows["game_date"] - last_played).dt.days

    reason = rows["dnp_reason"].fillna("").astype(str).str.strip().str.upper()
    # No reason given means nothing was announced, so it is not a known absence either.
    absent = (rows["did_not_play"] == True) & (reason != "") & ~reason.str.startswith("COACH")  # noqa: E712
    recent = absent & (days_out <= RECENT_ABSENCE_DAYS)

    totals = rows[_KEY].copy()
    totals["missing_min"] = usual_min.where(absent, 0.0).fillna(0.0)
    totals["missing_pts"] = usual_pts.where(absent, 0.0).fillna(0.0)
    totals["missing_min_recent"] = usual_min.where(recent, 0.0).fillna(0.0)
    return totals.groupby(_KEY, as_index=False, sort=False).sum()


def add_context(frame: pd.DataFrame, team_rows=(), appearance_rows=()) -> pd.DataFrame:
    """Return `frame` (one row per player-game) with every CONTEXT_FEATURES column added.

    Games with no team or appearance rows get NaN, which the architectures handle.
    """
    form = team_form(team_rows)
    absences = absence_totals(appearance_rows)

    own = form[_KEY + list(_FOR)].rename(columns={name: f"team_{name}" for name in _FOR})
    own = own.merge(absences.rename(columns={
        "missing_min": "team_missing_min", "missing_pts": "team_missing_pts",
        "missing_min_recent": "team_missing_min_recent"}), on=_KEY, how="outer")

    theirs = form[_KEY + list(_AGAINST) + ["pace_last10", "tov_last10"]].rename(
        columns={"team": "opponent", **{name: f"opp_{name}" for name in form.columns if name not in _KEY}})
    theirs = theirs.merge(
        absences[_KEY + ["missing_min"]].rename(columns={"team": "opponent", "missing_min": "opp_missing_min"}),
        on=["game_id", "opponent"], how="outer")

    result = frame.drop(columns=[column for column in CONTEXT_FEATURES if column in frame.columns])
    index = result.index
    result = result.merge(own, on=_KEY, how="left").merge(theirs, on=["game_id", "opponent"], how="left")
    result.index = index
    for column in CONTEXT_FEATURES:
        result[column] = result[column].astype(float) if column in result.columns else np.nan
    return result
