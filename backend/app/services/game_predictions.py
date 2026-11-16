"""Per-game predictions as served by the API: building the daily cache and ranking it per request.

The per-game model (app/ml/game_model.py) needs the game archive and the trained model, which
production (Render, low memory) does not load. So scripts/generate_game_predictions_cache.py
predicts the next few game days once a day and writes data/game_predictions_cache.json; the
routes in app/api/routes/game_predictions.py only read that file. Same pattern as
predictions_cache.json for the season model.

The cache covers several days so a late daily run still leaves the next games covered: at
request time upcoming() drops the days that have already passed.

Fantasy points and PRA are derived here at request time, so a user's scoring preset applies
without regenerating the cache.
"""
from datetime import datetime
from typing import Dict, List, Optional

from app.ml.game_features import TARGET_COLUMNS
from app.services.live_games import _normalize_tricode, TEAM_IDS, TEAM_LOGOS
from app.utils.fantasy import fantasy_points

# Stats the recommendations rank, in display order: the model's own targets plus derived ones.
RECOMMENDATION_STATS = ("pts", "reb", "ast", "fg3m", "pra", "fantasy")
# Picks: "top" = biggest projections; "over" / "fade" = furthest above / below the last-10 average.
RECOMMENDATION_KINDS = ("top", "over", "fade")
# Over/fade compare with a recent average, which is noise for deep-bench players.
MIN_AVERAGE_MINUTES = 15.0
DEFAULT_PICKS = 5
MAX_PICKS = 20

# Fields kept for a player's later games on a card: enough for one compact line each.
LATER_GAME_FIELDS = ("game_id", "game_date", "tipoff", "team", "opponent", "is_home", "opponent_logo", "injury",
                     "predicted_pts", "predicted_reb", "predicted_ast", "predicted_minutes")

SORT_KEYS = {"name", "team", "tipoff"} | {f"predicted_{stat}" for stat in (*TARGET_COLUMNS, "pra", "fantasy")} \
    | {f"diff_{stat}" for stat in (*TARGET_COLUMNS, "pra", "fantasy")}


def _number(value) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN -> None


def parse_scoreboard_event(event: Dict) -> Optional[Dict]:
    """One ESPN scoreboard event -> a slate game, or None if it already started or is not NBA vs NBA.

    ESPN's odds `spread` is the home team's line (negative = home favoured), the same
    convention the archive stores for the closing line, so the model reads it the same way.
    """
    try:
        competition = (event.get("competitions") or [{}])[0]
        if (event.get("status") or {}).get("type", {}).get("state", "pre") != "pre":
            return None
        sides = {c.get("homeAway"): _normalize_tricode((c.get("team") or {}).get("abbreviation", ""))
                 for c in competition.get("competitors") or []}
        home, away = sides.get("home"), sides.get("away")
        if home not in TEAM_IDS or away not in TEAM_IDS:
            return None
        odds = (competition.get("odds") or [{}])[0] or {}
        tipoff = event.get("date") or ""
        return {
            "game_id": str(event.get("id", "")),
            "tipoff": tipoff,
            "home": home,
            "away": away,
            "spread": _number(odds.get("spread")),
            "over_under": _number(odds.get("overUnder")),
            "odds_text": odds.get("details") or "",
        }
    except (AttributeError, TypeError, IndexError):
        return None


def _injury_fields(injury) -> Optional[Dict]:
    if not isinstance(injury, dict) or not injury.get("status"):
        return None
    keys = ("status", "status_abbr", "injury", "detail", "side", "return_date", "note")
    return {key: injury.get(key) for key in keys}


def _iso_date(value) -> str:
    """date, Timestamp or ISO string -> "YYYY-MM-DD" ("" when missing)."""
    if value is None or value != value:  # None or NaT
        return ""
    return value.isoformat()[:10] if hasattr(value, "isoformat") else str(value)[:10]


def build_cache(slate_date: str, games: List[Dict], frame, predictions, model, report: Optional[Dict] = None,
                generated_at: Optional[str] = None, previous: Optional[Dict] = None) -> Dict:
    """The JSON the API serves: the games, one row per (player, game), and the model's held-out accuracy.

    slate_date: the first day covered; slate_dates lists every day with games, oldest first.
    frame: build_upcoming_frame() output; predictions: model.predict(frame), same index.
    previous: the cache being replaced. The evaluation report is git-ignored, so the daily
    GitHub Action has none; it keeps the last known accuracy for the same architecture instead.
    """
    tipoffs = {game["game_id"]: game["tipoff"] for game in games}
    players = []
    for index, row in frame.iterrows():
        player = {
            "id": int(row["nba_player_id"]) if _number(row["nba_player_id"]) is not None else None,
            "espn_id": int(row["espn_player_id"]),
            "name": row["player_name"],
            "team": row["team"],
            "opponent": row["opponent"],
            "is_home": bool(row["is_home"]),
            "position": row["position"] or "",
            "game_id": row["game_id"],
            "game_date": _iso_date(row["game_date"]),
            "tipoff": tipoffs.get(row["game_id"], ""),
            "injury": _injury_fields(row["injury"]),
        }
        for stat in TARGET_COLUMNS:
            player[f"predicted_{stat}"] = round(float(predictions.loc[index, stat]), 1)
            baseline = _number(row[f"{'min' if stat == 'minutes' else stat}_last10"])
            player[f"last10_{stat}"] = round(baseline, 1) if baseline is not None else None
        players.append(player)

    accuracy = {}
    stats = ((report or {}).get("architectures", {}).get(model.architecture) or {}).get("stats", {})
    for stat in TARGET_COLUMNS:
        if stat in stats:
            accuracy[stat] = {key: round(float(stats[stat][key]), 2)
                              for key in ("mae", "naive_mae", "improvement_pct") if key in stats[stat]}
    if not accuracy and isinstance(previous, dict) \
            and (previous.get("model") or {}).get("architecture") == model.architecture:
        accuracy = previous.get("accuracy") or {}
    return {
        "generated_at": generated_at or datetime.now().astimezone().isoformat(timespec="seconds"),
        "slate_date": slate_date,
        "slate_dates": sorted({_iso_date(game.get("game_date")) for game in games} - {""}) or [slate_date],
        "model": {"architecture": model.architecture, "trained_at": model.trained_at,
                  "trained_rows": model.trained_rows},
        "accuracy": accuracy,
        "games": [{**{key: game.get(key) for key in ("game_id", "tipoff", "home", "away", "spread", "over_under", "odds_text")},
                   "game_date": _iso_date(game.get("game_date")) or slate_date}
                  for game in games],
        "players": players,
    }


def upcoming(cache: Dict, today: str) -> Dict:
    """Copy of the cache without the days before `today` (US Eastern, "YYYY-MM-DD").

    Rows and games from a cache written before multi-day slates have no game_date: they get
    slate_date. If every day has passed, every day is kept, so the pages can still show the
    games and flag them stale instead of showing nothing."""
    first = cache.get("slate_date") or ""
    games = [{**game, "game_date": game.get("game_date") or first} for game in cache.get("games") or []]
    rows = [{**row, "game_date": row.get("game_date") or first} for row in cache.get("players") or []]
    dates = sorted(({item["game_date"] for item in games + rows} | set(cache.get("slate_dates") or [first])) - {""})
    kept = [day for day in dates if day >= today] or dates
    return {
        **cache,
        "slate_date": kept[0] if kept else first,
        "slate_dates": kept,
        "games": [game for game in games if game["game_date"] in kept],
        "players": [row for row in rows if row["game_date"] in kept],
    }


def resolve_day(day: str, dates: List[str]) -> str:
    """A ?date= value -> a day in `dates`: "next" is the nearest, anything not covered is "" (all days)."""
    if day == "next":
        return dates[0] if dates else ""
    return day if day in dates else ""


def group_by_player(rows: List[Dict]) -> List[Dict]:
    """One row per player: his nearest game, with his later games compacted into `later_games`.

    Rows must already be enriched (later games carry the opponent's logo). Sort the result
    afterwards: the ranking is by each player's nearest game."""
    by_player: Dict = {}
    for row in sorted(rows, key=lambda r: (r.get("game_date") or "", r.get("tipoff") or "")):
        by_player.setdefault(row.get("espn_id") or row.get("id") or row["name"], []).append(row)
    grouped = []
    for games in by_player.values():
        nearest = dict(games[0])
        nearest["later_games"] = [{key: game.get(key) for key in LATER_GAME_FIELDS} for game in games[1:]]
        grouped.append(nearest)
    return grouped


def with_logos(game: Dict) -> Dict:
    """Copy of a slate game with both teams' logo URLs (added per request, so the cache needn't change)."""
    return {**game, "home_logo": TEAM_LOGOS.get(game.get("home")), "away_logo": TEAM_LOGOS.get(game.get("away"))}


def enrich(row: Dict, weights=None) -> Dict:
    """Copy of a cached row with team logos, PRA, fantasy points and every predicted-minus-average diff."""
    row = dict(row)
    row["team_logo"] = TEAM_LOGOS.get(row.get("team"))
    row["opponent_logo"] = TEAM_LOGOS.get(row.get("opponent"))
    for prefix in ("predicted", "last10"):
        values = [row.get(f"{prefix}_{stat}") for stat in ("pts", "reb", "ast")]
        row[f"{prefix}_pra"] = round(sum(values), 1) if all(v is not None for v in values) else None
        has_all = all(row.get(f"{prefix}_{stat}") is not None for stat in ("pts", "reb", "ast", "stl", "blk", "tov"))
        row[f"{prefix}_fantasy"] = (fantasy_points(row, lambda stat, p=prefix: f"{p}_{stat}", weights=weights)
                                    if has_all else None)
    for stat in (*TARGET_COLUMNS, "pra", "fantasy"):
        predicted, average = row.get(f"predicted_{stat}"), row.get(f"last10_{stat}")
        row[f"diff_{stat}"] = round(predicted - average, 1) if None not in (predicted, average) else None
    return row


def filter_rows(rows: List[Dict], search: str = "", team: str = "", game_id: str = "", day: str = "") -> List[Dict]:
    search = search.lower()
    return [row for row in rows
            if (not search or search in row["name"].lower())
            and (not team or row["team"] == team)
            and (not game_id or row["game_id"] == game_id)
            and (not day or row.get("game_date") == day)]


def sort_rows(rows: List[Dict], sort_by: str, sort_order: str) -> List[Dict]:
    sort_by = sort_by if sort_by in SORT_KEYS else "predicted_pts"
    reverse = sort_order == "desc"
    if sort_by in ("name", "team", "tipoff"):
        return sorted(rows, key=lambda row: (str(row.get(sort_by) or "").lower(), row["name"].lower()), reverse=reverse)
    # Missing values sort last in either direction.
    present = [row for row in rows if row.get(sort_by) is not None]
    missing = [row for row in rows if row.get(sort_by) is None]
    return sorted(present, key=lambda row: row[sort_by], reverse=reverse) + missing


def _pick_key(row: Dict):
    """One player in one game, for keeping a player out of two pick lists."""
    return row.get("espn_id") or row.get("id") or row.get("name"), row.get("game_id")


def recommendations(rows: List[Dict], limit: int = DEFAULT_PICKS) -> Dict[str, Dict[str, List[Dict]]]:
    """{kind: {stat: [rows]}} for every RECOMMENDATION_KINDS x RECOMMENDATION_STATS.

    Rows must already be enriched. Players flagged on the injury report stay in (with their
    flag): only ruled-out players are left out, and the cache never contains those.

    A player shows up in one list per stat: one already in "top" is left out of "over" and
    "fade", which fill up with the next players. "top" keeps him because it is a plain ranking
    by projection, and a top list without its #1 would read as broken.
    """
    regulars = [row for row in rows if (row.get("last10_minutes") or 0) >= MIN_AVERAGE_MINUTES]
    picks = {kind: {} for kind in RECOMMENDATION_KINDS}
    for stat in RECOMMENDATION_STATS:
        picks["top"][stat] = sort_rows(rows, f"predicted_{stat}", "desc")[:limit]
        in_top = {_pick_key(row) for row in picks["top"][stat]}
        rest = [row for row in regulars if _pick_key(row) not in in_top]
        over = [row for row in rest if (row.get(f"diff_{stat}") or 0) > 0]
        fade = [row for row in rest if (row.get(f"diff_{stat}") or 0) < 0]
        picks["over"][stat] = sort_rows(over, f"diff_{stat}", "desc")[:limit]
        picks["fade"][stat] = sort_rows(fade, f"diff_{stat}", "asc")[:limit]
    return picks
