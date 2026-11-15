"""Per-game predictions as served by the API: building the daily cache and ranking it per request.

The per-game model (app/ml/game_model.py) needs the game archive and the trained model, which
production (Render, low memory) does not load. So scripts/generate_game_predictions_cache.py
predicts the next slate once a day and writes data/game_predictions_cache.json; the routes in
app/api/routes/game_predictions.py only read that file. Same pattern as predictions_cache.json
for the season model.

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


def build_cache(slate_date: str, games: List[Dict], frame, predictions, model, report: Optional[Dict] = None,
                generated_at: Optional[str] = None, previous: Optional[Dict] = None) -> Dict:
    """The JSON the API serves: the slate, one row per player, and the model's held-out accuracy.

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
        "model": {"architecture": model.architecture, "trained_at": model.trained_at,
                  "trained_rows": model.trained_rows},
        "accuracy": accuracy,
        "games": [{key: game.get(key) for key in ("game_id", "tipoff", "home", "away", "spread", "over_under", "odds_text")}
                  for game in games],
        "players": players,
    }


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


def filter_rows(rows: List[Dict], search: str = "", team: str = "", game_id: str = "") -> List[Dict]:
    search = search.lower()
    return [row for row in rows
            if (not search or search in row["name"].lower())
            and (not team or row["team"] == team)
            and (not game_id or row["game_id"] == game_id)]


def sort_rows(rows: List[Dict], sort_by: str, sort_order: str) -> List[Dict]:
    sort_by = sort_by if sort_by in SORT_KEYS else "predicted_pts"
    reverse = sort_order == "desc"
    if sort_by in ("name", "team", "tipoff"):
        return sorted(rows, key=lambda row: (str(row.get(sort_by) or "").lower(), row["name"].lower()), reverse=reverse)
    # Missing values sort last in either direction.
    present = [row for row in rows if row.get(sort_by) is not None]
    missing = [row for row in rows if row.get(sort_by) is None]
    return sorted(present, key=lambda row: row[sort_by], reverse=reverse) + missing


def recommendations(rows: List[Dict], limit: int = DEFAULT_PICKS) -> Dict[str, Dict[str, List[Dict]]]:
    """{kind: {stat: [rows]}} for every RECOMMENDATION_KINDS x RECOMMENDATION_STATS.

    Rows must already be enriched. Players flagged on the injury report stay in (with their
    flag): only ruled-out players are left out, and the cache never contains those.
    """
    regulars = [row for row in rows if (row.get("last10_minutes") or 0) >= MIN_AVERAGE_MINUTES]
    picks = {kind: {} for kind in RECOMMENDATION_KINDS}
    for stat in RECOMMENDATION_STATS:
        picks["top"][stat] = sort_rows(rows, f"predicted_{stat}", "desc")[:limit]
        over = [row for row in regulars if (row.get(f"diff_{stat}") or 0) > 0]
        fade = [row for row in regulars if (row.get(f"diff_{stat}") or 0) < 0]
        picks["over"][stat] = sort_rows(over, f"diff_{stat}", "desc")[:limit]
        picks["fade"][stat] = sort_rows(fade, f"diff_{stat}", "asc")[:limit]
    return picks
