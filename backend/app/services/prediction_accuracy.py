"""Tracks how this season's predictions compare with the games played so far.

Three pieces, all in PostgreSQL:

- prediction_log: every prediction, written once the first time a set of predictions is seen and
  never changed. A retrain produces a new model_version next to the old one, so a mid-season
  retrain cannot rewrite how the earlier model did.
- player_errors(): joins the log to the game archive, giving predicted vs actual per player as of
  any date. Internal only; scripts/accuracy_report.py prints it.
- prediction_accuracy: a daily rollup, MAE (mean absolute error) per stat next to the MAE of a
  naive baseline that assumes each player repeats last season. The website's summary comes from it.
"""
import hashlib
import json
from collections import defaultdict
from datetime import date, datetime
from statistics import median
from typing import Dict, List, Optional

from app.api.helpers import SO_FAR_FIELDS
from app.services import game_archive

# Early-season averages swing a lot: players need this many games before they are scored.
MIN_GAMES = 5
# Fewer scored players than this is too small a sample to advertise.
MIN_PLAYERS = 100
# The stat the "good season" verdict is judged on.
HEADLINE_STAT = 'ppg'
# The website only gets these stats; the full set stays internal.
PUBLIC_STATS = ('ppg', 'rpg', 'apg')
# "Called it" players: rotation players only, so a rarely-used reserve can't top the list.
BEST_CALL_MIN_GAMES = 10
BEST_CALL_MIN_MINUTES = 20
BEST_CALL_LIMIT = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS prediction_accuracy (
    season        INTEGER NOT NULL,           -- ESPN season year, 2027 = 2026-27
    snapshot_date DATE NOT NULL,              -- US Eastern date the snapshot was taken
    stat          TEXT NOT NULL,              -- 'ppg', 'rpg', ...
    players       INTEGER NOT NULL,           -- players scored
    min_games     INTEGER NOT NULL,           -- games a player needed to be scored
    mae           DOUBLE PRECISION NOT NULL,  -- model: mean |predicted - actual|
    baseline_mae  DOUBLE PRECISION NOT NULL,  -- naive: mean |last season - actual|
    PRIMARY KEY (season, snapshot_date, stat)
);

CREATE TABLE IF NOT EXISTS prediction_log (
    season        INTEGER NOT NULL,           -- season the prediction is for
    model_version TEXT NOT NULL,              -- fingerprint of the whole prediction set
    player_id     BIGINT NOT NULL,            -- NBA.com person ID
    player_name   TEXT NOT NULL,
    stat          TEXT NOT NULL,
    predicted     DOUBLE PRECISION NOT NULL,
    last_season   DOUBLE PRECISION NOT NULL,  -- the naive baseline's guess
    logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (season, model_version, player_id, stat)
);
"""

# Per-player prediction rows, set once by start(). None until the predictions are ready.
_prediction_rows: Optional[List[Dict]] = None


def init_tables(conn) -> None:
    conn.execute(SCHEMA)


# ---------------------------------------------------------------------------
# Scoring (pure functions: no database or network)
# ---------------------------------------------------------------------------

def score(predictions: List[Dict], actuals: List[Dict], min_games: int = MIN_GAMES) -> List[Dict]:
    """One row per (player, stat) with the prediction, the baseline and what actually happened.

    `predictions` are rows from the predictions list ('id', 'predicted_ppg', 'ppg_last', ...);
    `actuals` are state.current_season_data rows ('PLAYER_ID', 'PPG_LAST', 'GAMES_PLAYED_LAST', ...).
    """
    played = {p['PLAYER_ID']: p for p in actuals if (p.get('GAMES_PLAYED_LAST') or 0) >= min_games}
    errors = []
    for key, field in SO_FAR_FIELDS:
        for row in predictions:
            actual = played.get(row.get('id'))
            predicted, last = row.get(f'predicted_{key}'), row.get(f'{key}_last')
            if actual is None or predicted is None or last is None or actual.get(field) is None:
                continue
            errors.append({
                'player_id': row['id'], 'player_name': row.get('name'), 'team': actual.get('TEAM'),
                'stat': key, 'predicted': predicted, 'last_season': last,
                'actual': actual[field], 'games': actual['GAMES_PLAYED_LAST'],
            })
    return errors


def metrics(errors: List[Dict]) -> List[Dict]:
    """Per-stat accuracy over score()/player_errors() rows, in SO_FAR_FIELDS order.

    bias is the mean signed error (positive = the model predicts too high); beat_baseline_pct is
    the share of players the model was closer on than the "same as last season" guess.
    """
    by_stat = defaultdict(list)
    for row in errors:
        by_stat[row['stat']].append(row)
    results = []
    for key, _ in SO_FAR_FIELDS:
        rows = by_stat.get(key)
        if not rows:
            continue
        signed = [r['predicted'] - r['actual'] for r in rows]
        model = [abs(e) for e in signed]
        baseline = [abs(r['last_season'] - r['actual']) for r in rows]
        results.append({
            'stat': key, 'players': len(rows),
            'mae': sum(model) / len(rows),
            'baseline_mae': sum(baseline) / len(rows),
            'bias': sum(signed) / len(rows),
            'median_abs_error': median(model),
            'beat_baseline_pct': 100 * sum(m < b for m, b in zip(model, baseline)) / len(rows),
        })
    return results


def compute(predictions: List[Dict], actuals: List[Dict], min_games: int = MIN_GAMES) -> List[Dict]:
    """The daily rollup rows (one per stat) for prediction rows vs current-season averages."""
    return _rollup(score(predictions, actuals, min_games), min_games)


def _rollup(errors: List[Dict], min_games: int) -> List[Dict]:
    return [{'stat': m['stat'], 'players': m['players'], 'min_games': min_games,
             'mae': m['mae'], 'baseline_mae': m['baseline_mae']} for m in metrics(errors)]


def best_calls(errors: List[Dict], limit: int = BEST_CALL_LIMIT) -> List[Dict]:
    """Rotation players whose points, rebounds and assists were predicted most closely.

    Ranked by the total miss across PUBLIC_STATS (in per-game units), smallest first.
    """
    players = defaultdict(dict)
    for row in errors:
        players[row['player_id']][row['stat']] = row
    calls = []
    for player_id, stats in players.items():
        if any(key not in stats for key in PUBLIC_STATS) or 'mpg' not in stats:
            continue
        first = stats[PUBLIC_STATS[0]]
        if first['games'] < BEST_CALL_MIN_GAMES or stats['mpg']['actual'] < BEST_CALL_MIN_MINUTES:
            continue
        calls.append({
            'id': player_id, 'name': first['player_name'], 'team': first.get('team'),
            'games': first['games'],
            'miss': sum(abs(stats[key]['predicted'] - stats[key]['actual']) for key in PUBLIC_STATS),
            'stats': {key: {'predicted': round(stats[key]['predicted'], 1),
                            'actual': round(stats[key]['actual'], 1)} for key in PUBLIC_STATS},
        })
    calls.sort(key=lambda c: (c['miss'], c['name'] or ''))
    return [{**c, 'miss': round(c['miss'], 1)} for c in calls[:limit]]


def is_good(rows: List[Dict]) -> bool:
    """Worth advertising: enough players scored and the model beats the naive baseline."""
    headline = next((r for r in rows if r['stat'] == HEADLINE_STAT), None)
    return bool(headline and headline['players'] >= MIN_PLAYERS and headline['mae'] < headline['baseline_mae'])


def summarize(season_year: int, snapshot_date: date, rows: List[Dict],
              calls: Optional[List[Dict]] = None) -> Optional[Dict]:
    """The public API payload for one snapshot's rows, or None when there is nothing to report.

    Only PUBLIC_STATS are included: this is what the website can see.
    """
    if not rows:
        return None
    return {
        'season': game_archive.season_label(season_year),
        'as_of': snapshot_date.isoformat(),
        'players': max(r['players'] for r in rows),
        'min_games': rows[0]['min_games'],
        'good': is_good(rows),
        'stats': {
            r['stat']: {
                'mae': round(r['mae'], 2),
                'baseline_mae': round(r['baseline_mae'], 2),
                # Positive = the model's error is this much smaller than the baseline's.
                'improvement_pct': round((1 - r['mae'] / r['baseline_mae']) * 100, 1) if r['baseline_mae'] else 0.0,
            }
            for r in rows if r['stat'] in PUBLIC_STATS
        },
        'best_calls': calls or [],
    }


# ---------------------------------------------------------------------------
# Prediction log
# ---------------------------------------------------------------------------

def _log_entries(predictions: List[Dict]) -> List[tuple]:
    entries = []
    for row in predictions:
        for key, _ in SO_FAR_FIELDS:
            predicted, last = row.get(f'predicted_{key}'), row.get(f'{key}_last')
            if row.get('id') is None or predicted is None or last is None:
                continue
            entries.append((int(row['id']), row.get('name') or '', key, float(predicted), float(last)))
    return sorted(entries)


def model_version(predictions: List[Dict]) -> str:
    """A fingerprint of the predicted values: the same predictions always give the same version,
    and any retrain that changes a prediction gives a new one."""
    values = [(player_id, stat, predicted) for player_id, _, stat, predicted, _ in _log_entries(predictions)]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()[:12]


def log_predictions(conn, season_year: int, predictions: List[Dict]) -> bool:
    """Freeze this prediction set in prediction_log. Returns False if it must not be scored.

    Idempotent: logging the same set again inserts nothing. A set first logged for an earlier
    season is stale (the cache was not regenerated after the season rolled over), so it is
    neither logged nor scored against the new season.
    """
    entries = _log_entries(predictions)
    if not entries:
        return False
    version = model_version(predictions)
    logged = conn.execute("SELECT DISTINCT season FROM prediction_log WHERE model_version = %s",
                          (version,)).fetchall()
    seasons = {row['season'] for row in logged}
    if season_year in seasons:
        return True
    if seasons:
        print(f"[prediction_accuracy] predictions {version} were made for {min(seasons)}, "
              f"not {season_year}; regenerate predictions_cache.json to track this season.")
        return False
    ids, names, stats, predicted, last = (list(column) for column in zip(*entries))
    conn.execute("""
        INSERT INTO prediction_log (season, model_version, player_id, player_name, stat, predicted, last_season)
        SELECT %s, %s, * FROM unnest(%s::bigint[], %s::text[], %s::text[], %s::float8[], %s::float8[])
        ON CONFLICT DO NOTHING
    """, (season_year, version, ids, names, stats, predicted, last))
    conn.commit()
    return True


def logged_versions(conn, season_year: int) -> List[Dict]:
    """Prediction sets logged for a season, newest first."""
    return conn.execute("""
        SELECT model_version, MIN(logged_at) AS logged_at, COUNT(DISTINCT player_id) AS players
        FROM prediction_log WHERE season = %s
        GROUP BY model_version ORDER BY MIN(logged_at) DESC
    """, (season_year,)).fetchall()


def player_errors(conn, season_year: int, version: str, as_of: Optional[date] = None,
                  min_games: int = MIN_GAMES) -> List[Dict]:
    """Logged predictions joined to regular-season averages through `as_of` (default: all games).

    Same row shape as score(), so metrics() and best_calls() work on either.
    """
    actual = ' '.join(f"WHEN '{key}' THEN a.{key}" for key, _ in SO_FAR_FIELDS)
    return conn.execute(f"""
        WITH actuals AS (
            SELECT nba_player_id AS player_id, COUNT(*) AS games,
                (array_agg(team ORDER BY game_date DESC))[1] AS team,
                COALESCE(SUM(pts), 0)::float8 / COUNT(*) AS ppg,
                COALESCE(SUM(ast), 0)::float8 / COUNT(*) AS apg,
                COALESCE(SUM(reb), 0)::float8 / COUNT(*) AS rpg,
                COALESCE(SUM(stl), 0)::float8 / COUNT(*) AS spg,
                COALESCE(SUM(blk), 0)::float8 / COUNT(*) AS bpg,
                COALESCE(SUM(tov), 0)::float8 / COUNT(*) AS tov,
                COALESCE(SUM(minutes), 0)::float8 / COUNT(*) AS mpg
            FROM player_game_stats
            WHERE season = %(season)s AND season_type = 2 AND NOT did_not_play
                AND nba_player_id IS NOT NULL
                AND (%(as_of)s::date IS NULL OR game_date <= %(as_of)s::date)
            GROUP BY nba_player_id
            HAVING COUNT(*) >= %(min_games)s
        )
        SELECT l.player_id, l.player_name, a.team, l.stat, l.predicted, l.last_season,
            CASE l.stat {actual} END AS actual, a.games
        FROM prediction_log l JOIN actuals a USING (player_id)
        WHERE l.season = %(season)s AND l.model_version = %(version)s
    """, {'season': season_year, 'version': version, 'as_of': as_of, 'min_games': min_games}).fetchall()


# ---------------------------------------------------------------------------
# Daily rollup
# ---------------------------------------------------------------------------

def save_snapshot(conn, season_year: int, snapshot_date: date, rows: List[Dict]) -> None:
    """Upsert one day's rows, so rerunning (or several Gunicorn workers) never duplicates them."""
    with conn.transaction():
        for row in rows:
            game_archive._upsert(conn, 'prediction_accuracy',
                                 {'season': season_year, 'snapshot_date': snapshot_date, **row},
                                 ['season', 'snapshot_date', 'stat'])
    conn.commit()


def latest_snapshot(conn, season_year: int) -> Optional[Dict]:
    """The most recent stored snapshot for a season, in the API payload shape."""
    rows = conn.execute("""
        SELECT snapshot_date, stat, players, min_games, mae, baseline_mae
        FROM prediction_accuracy
        WHERE season = %s AND snapshot_date = (
            SELECT MAX(snapshot_date) FROM prediction_accuracy WHERE season = %s)
    """, (season_year, season_year)).fetchall()
    if not rows:
        return None
    order = [key for key, _ in SO_FAR_FIELDS]
    rows.sort(key=lambda r: order.index(r['stat']) if r['stat'] in order else len(order))
    return summarize(season_year, rows[0]['snapshot_date'], rows)


def _load_prediction_rows() -> List[Dict]:
    from app import state

    if isinstance(state.predictions_cache, dict):
        return state.predictions_cache.get('all_players_list') or []
    if state.ai_available and state.ai:
        # The full model builds the same rows the /api/predictions route serves.
        from app.api.routes.predictions import _prediction_rows_from_model
        return _prediction_rows_from_model() or []
    return []


def record(conn=None, today: Optional[date] = None) -> Optional[Dict]:
    """Score the predictions against the season so far, store the snapshot and publish it.

    Never raises: this runs after startup and after every archive reload, where a failure here
    must not break the data they just loaded. Without `conn` the snapshot is published to
    state.prediction_accuracy but not stored.
    """
    from app import state

    if _prediction_rows is None:  # start() has not run yet, or the predictions are stale
        return None
    try:
        season_year = state.current_season_year
        errors = score(_prediction_rows, state.current_season_data)
        rows = _rollup(errors, MIN_GAMES)
        if not rows:
            return None
        snapshot_date = today or datetime.now(game_archive._ET).date()
        if conn is not None:
            save_snapshot(conn, season_year, snapshot_date, rows)
        state.prediction_accuracy = summarize(season_year, snapshot_date, rows, best_calls(errors))
        return state.prediction_accuracy
    except Exception as exc:
        if conn is not None:
            conn.rollback()  # clear a failed transaction so the caller's connection stays usable
        print(f"[prediction_accuracy] snapshot failed: {exc}")
        return None


def start(conn=None) -> Optional[Dict]:
    """Load the prediction rows once the predictions are ready, log them, then take the first snapshot.

    If nothing can be scored yet (e.g. the archive is still catching up), fall back to the last
    stored snapshot so the API has something to serve until the next reload.
    """
    global _prediction_rows
    from app import state

    try:
        rows = _load_prediction_rows()
        if conn is not None and rows and not log_predictions(conn, state.current_season_year, rows):
            _prediction_rows = None
            return None
        _prediction_rows = rows
    except Exception as exc:
        if conn is not None:
            conn.rollback()
        print(f"[prediction_accuracy] could not load predictions: {exc}")
        return None
    result = record(conn)
    if result is None and conn is not None:
        try:
            state.prediction_accuracy = latest_snapshot(conn, state.current_season_year)
        except Exception as exc:
            conn.rollback()
            print(f"[prediction_accuracy] could not read stored snapshot: {exc}")
    return state.prediction_accuracy
