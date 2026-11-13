from flask import Blueprint, jsonify

from app import db, state
from app.api.helpers import request_weights, season_fantasy
from app.services import game_archive, standings
from app.services.live_games import TEAM_LOGOS, TEAM_NAMES
from app.utils.player_ids import player_id_for

bp = Blueprint('teams', __name__, url_prefix='/api/teams')


def _pct(ratio):
    """A stored 0-1 shooting ratio as a percentage with one decimal (0.4567 -> 45.7)."""
    return round((ratio or 0) * 100, 1)


_STAT_FIELDS = (('ppg', 'PPG_LAST'), ('rpg', 'RPG_LAST'), ('apg', 'APG_LAST'), ('spg', 'SPG_LAST'), ('bpg', 'BPG_LAST'))
_PCT_FIELDS = (('fg_pct', 'FG_PCT_LAST'), ('fg3_pct', 'FG3_PCT_LAST'), ('ft_pct', 'FT_PCT_LAST'))


def _roster(tricode, listed=()):
    """This team's players, best scorer first.

    Membership and stats come from different places on purpose. Stats are this season's
    archive averages, which only cover players who have played. Membership also takes in
    `listed`: players the archive's box scores name for this team this season, even as did-not-
    play, so someone injured all season still appears. Such a player gets None stats and 0
    games rather than last season's numbers under this season's label. Before any game is
    archived (or without a database) the season pickle supplies both."""
    current_teams = state.current_player_teams()
    weights = request_weights()
    baseline = {p['PLAYER_ID']: p for p in state.nba_data or [] if p.get('PLAYER_ID')}
    roster = {}
    for player in state.current_season_data or state.nba_data or []:
        name = player.get('PLAYER_NAME', '')
        player_id = player.get('PLAYER_ID') or player_id_for(name)
        if current_teams.get(player_id, player.get('TEAM')) != tricode:
            continue
        entry = {
            'id': player_id,
            'name': name,
            'position': player.get('POSITION') or 'UNK',
            'age': int(player['AGE']) if player.get('AGE') else None,
            'games_played': int(player.get('GAMES_PLAYED_LAST', 0) or 0),
        }
        for key, column in _STAT_FIELDS:
            entry[key] = round(player.get(column, 0) or 0, 1)
        for key, column in _PCT_FIELDS:
            entry[key] = _pct(player.get(column))
        # Scored with the caller's own preset (X-Fantasy-Scoring), like the Stats page.
        entry['fpts'] = season_fantasy(player, weights)
        roster[player_id] = entry

    for row in listed:
        name = row.get('player_name') or ''
        player_id = int(row['nba_player_id']) if row.get('nba_player_id') else player_id_for(name)
        # A newer observation (a live game, a trade) outranks the last archived listing.
        if player_id in roster or current_teams.get(player_id, tricode) != tricode:
            continue
        known = baseline.get(player_id, {})
        roster[player_id] = {
            'id': player_id,
            'name': known.get('PLAYER_NAME') or name,
            'position': known.get('POSITION') or row.get('position') or 'UNK',
            # The pickle's age is a season old.
            'age': int(known['AGE']) + 1 if known.get('AGE') else None,
            'games_played': 0,
            **{key: None for key, _ in _STAT_FIELDS + _PCT_FIELDS},
            'fpts': None,
        }
    # Players without a game this season (None stats) go last.
    return sorted(roster.values(), key=lambda p: (p['ppg'] is None, -(p['ppg'] or 0), p['name']))


def _standings_row(tricode):
    """This team's row in the league standings, or None when the standings are unavailable.
    Standings are cached for an hour (and served stale on failure), so this is usually free."""
    try:
        table = standings.get_standings()
        return next((row for row in [*table.get('east', []), *table.get('west', [])]
                     if row.get('tricode') == tricode), None)
    except Exception as e:
        print(f"Error loading standings for {tricode}: {e}")
        return None


def _record(tricode, games):
    """(record, games_missing). The archive only knows the games it has stored: an install that
    started mid-season, or missed a few nights, would show a wrong season record. So the record
    comes from the standings whenever they count more games than the archive holds, and
    games_missing says how many regular-season games the archive lacks (0 = complete)."""
    results = [g['result'] for g in games if g['season_type'] == 2 and g['result']]
    archived = {'wins': results.count('W'), 'losses': results.count('L'), 'source': 'archive'}
    row = _standings_row(tricode)
    if not row:
        return archived, 0
    missing = int(row.get('wins') or 0) + int(row.get('losses') or 0) - len(results)
    if missing <= 0:
        # The archive is complete and at least as fresh as the hourly standings cache.
        return archived, 0
    return {'wins': int(row.get('wins') or 0), 'losses': int(row.get('losses') or 0), 'source': 'standings',
            'home': row.get('home') or None, 'away': row.get('away') or None,
            'streak': row.get('streak') or None}, missing


def _archive(tricode):
    """(games, listed players, available) from one database connection. A database failure
    costs the games section and the did-not-play roster entries only, never the page."""
    try:
        conn = db.get_db()
        # Closing sits inside the outer try, so a failed close is handled like any other
        # database failure instead of turning the whole response into a 500.
        try:
            year = state.current_season_year
            return (game_archive.team_season_games(conn, tricode, year),
                    game_archive.team_listed_players(conn, tricode, year), True)
        finally:
            conn.close()
    except Exception as e:
        print(f"Error loading the archive for {tricode}: {e}")
        return [], [], False


@bp.route('/<string:tricode>', methods=['GET'])
def get_team(tricode):
    """Everything the team page shows: the team, its games this season and its roster."""
    tricode = tricode.upper()
    if tricode not in TEAM_NAMES:
        return jsonify({'error': 'Team not found'}), 404

    city, name = TEAM_NAMES[tricode]
    games, listed, games_available = _archive(tricode)
    record, games_missing = _record(tricode, games)
    return jsonify({
        'team': {'tricode': tricode, 'city': city, 'name': name, 'logo': TEAM_LOGOS.get(tricode, '')},
        'season': state.current_season_year,
        'season_label': game_archive.season_label(state.current_season_year),
        'record': record,
        'games': games,
        'games_available': games_available,
        'games_missing': games_missing,
        'roster': _roster(tricode, listed),
    }), 200
