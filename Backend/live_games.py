import requests
from datetime import datetime, timezone, timedelta
import time

SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json"
BOXSCORE_URL   = "https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json"
SCHEDULE_URL   = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"

TEAM_IDS = {
    "ATL":1610612737,"BOS":1610612738,"BKN":1610612751,"CHA":1610612766,
    "CHI":1610612741,"CLE":1610612739,"DAL":1610612742,"DEN":1610612743,
    "DET":1610612765,"GSW":1610612744,"HOU":1610612745,"IND":1610612754,
    "LAC":1610612746,"LAL":1610612747,"MEM":1610612763,"MIA":1610612748,
    "MIL":1610612749,"MIN":1610612750,"NOP":1610612740,"NYK":1610612752,
    "OKC":1610612760,"ORL":1610612753,"PHI":1610612755,"PHX":1610612756,
    "POR":1610612757,"SAC":1610612758,"SAS":1610612759,"TOR":1610612761,
    "UTA":1610612762,"WAS":1610612764,
}

TEAM_LOGOS = {t: f"https://cdn.nba.com/logos/nba/{id}/global/L/logo.svg" for t, id in TEAM_IDS.items()}

_cache = {}
CACHE_TTL = 30

def _get(url):
    now = time.time()
    if url in _cache and now - _cache[url]['ts'] < CACHE_TTL:
        return _cache[url]['data']
    try:
        r = requests.get(url, timeout=3, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()
        _cache[url] = {'data': data, 'ts': now}
        return data
    except Exception as e:
        print(f"[live_games] fetch error: {e}")
        return None

def _fmt_player_live(p):
    s = p.get('statistics', {})
    return {
        'personId':  p.get('personId'),
        'name':      p.get('name', ''),
        'jerseyNum': p.get('jerseyNum', ''),
        'position':  p.get('position', ''),
        'status':    p.get('status', ''),
        'oncourt':   p.get('oncourt', '0') == '1',
        'pts':       s.get('points', 0),
        'reb':       s.get('reboundsTotal', 0),
        'ast':       s.get('assists', 0),
        'stl':       s.get('steals', 0),
        'blk':       s.get('blocks', 0),
        'fgm':       s.get('fieldGoalsMade', 0),
        'fga':       s.get('fieldGoalsAttempted', 0),
        'fg3m':      s.get('threePointersMade', 0),
        'fg3a':      s.get('threePointersAttempted', 0),
        'ftm':       s.get('freeThrowsMade', 0),
        'fta':       s.get('freeThrowsAttempted', 0),
        'tov':       s.get('turnovers', 0),
        'min':       s.get('minutesCalculated', 'PT0M').replace('PT','').replace('M','') + 'm',
        'plusMinus': s.get('plusMinusPoints', 0),
    }

def _roster_from_pkl(tricode, nba_data):
    """Build a zeroed-out game roster from pkl season data for a given team."""
    if not nba_data:
        return []
    players = [p for p in nba_data if p.get('TEAM') == tricode]
    result = []
    for p in players:
        name = p.get('PLAYER_NAME', '')
        result.append({
            'personId':  p.get('PLAYER_ID', abs(hash(name)) % 10**7),
            'name':      name,
            'jerseyNum': '',
            'position':  p.get('POSITION', ''),
            'status':    'ACTIVE',
            'oncourt':   False,
            # Game stats all zero (game hasn't started)
            'pts': 0, 'reb': 0, 'ast': 0, 'stl': 0, 'blk': 0,
            'fgm': 0, 'fga': 0, 'fg3m': 0, 'fg3a': 0,
            'ftm': 0, 'fta': 0, 'tov': 0, 'min': '0m', 'plusMinus': 0,
            # Season stats for context
            'season_ppg': round(p.get('PPG_LAST', 0), 1),
            'season_rpg': round(p.get('RPG_LAST', 0), 1),
            'season_apg': round(p.get('APG_LAST', 0), 1),
        })
    # Sort by season PPG descending so starters appear first
    result.sort(key=lambda x: x['season_ppg'], reverse=True)
    return result

def get_todays_games(nba_data=None):
    data = _get(SCOREBOARD_URL)

    print("DATA KEYS:", data.keys() if data else "NO DATA")
    print("RAW DATA SAMPLE:", str(data)[:500] if data else "NO DATA")
    if not data:
        return []

        

    games = data.get('scoreboard', {}).get('games', [])
    result = []

    for g in games:
        game_id     = g.get('gameId', '')
        status_num  = g.get('gameStatus', 1)
        status_text = g.get('gameStatusText', '')
        home        = g.get('homeTeam', {})
        away        = g.get('awayTeam', {})
        home_tri    = home.get('teamTricode', '')
        away_tri    = away.get('teamTricode', '')

        def quarter_scores(team):
            return [{'q': p.get('period', i+1), 'score': p.get('score', 0)}
                    for i, p in enumerate(team.get('periods', []))]

        game_obj = {
            'gameId':     game_id,
            'status':     status_num,
            'statusText': status_text,
            'gameTime':   g.get('gameEt', ''),
            'arena':      g.get('arenaName', ''),
            'home': {
                'tricode':  home_tri,
                'name':     home.get('teamName', ''),
                'city':     home.get('teamCity', ''),
                'score':    home.get('score', 0),
                'logo':     TEAM_LOGOS.get(home_tri, ''),
                'quarters': quarter_scores(home),
                'record':   f"{home.get('wins',0)}-{home.get('losses',0)}",
            },
            'away': {
                'tricode':  away_tri,
                'name':     away.get('teamName', ''),
                'city':     away.get('teamCity', ''),
                'score':    away.get('score', 0),
                'logo':     TEAM_LOGOS.get(away_tri, ''),
                'quarters': quarter_scores(away),
                'record':   f"{away.get('wins',0)}-{away.get('losses',0)}",
            },
            'period':    g.get('period', 0),
            'gameClock': g.get('gameClock', ''),
            'players':   {'home': [], 'away': []},
        }

        if status_num in (2, 3):
            # Live/final — use real boxscore
            box = _get(BOXSCORE_URL.format(gameId=game_id))
            if box:
                bsg = box.get('game', {})
                for side in ('homeTeam', 'awayTeam'):
                    key = 'home' if side == 'homeTeam' else 'away'
                    game_obj['players'][key] = [
                        _fmt_player_live(p) for p in bsg.get(side, {}).get('players', [])
                    ]
        else:
            # Future today — populate rosters from pkl with zeroed game stats
            game_obj['players']['home'] = _roster_from_pkl(home_tri, nba_data)
            game_obj['players']['away'] = _roster_from_pkl(away_tri, nba_data)

        result.append(game_obj)

    return result

def get_upcoming_games(days=7, nba_data=None):
    """Return next N days of games with zeroed game stats but season stats from pkl."""
    data = _get(SCHEDULE_URL)
    if not data:
        return []

    today    = datetime.now(timezone.utc).date()
    upcoming = []

    game_dates = data.get('leagueSchedule', {}).get('gameDates', [])
    for gd in game_dates:
        try:
            date_str   = gd.get('gameDate', '')[:10]
            sep        = '/' if '/' in date_str else '-'
            fmt        = '%m/%d/%Y' if sep == '/' else '%Y-%m-%d'
            game_date  = datetime.strptime(date_str, fmt).date()
        except Exception:
            continue

        delta = (game_date - today).days
        if delta <= 0 or delta > days:
            continue

        for g in gd.get('games', []):
            home_tri = g.get('homeTeam', {}).get('teamTricode', '')
            away_tri = g.get('awayTeam', {}).get('teamTricode', '')
            upcoming.append({
                'gameId':     g.get('gameId', ''),
                'status':     1,
                'statusText': game_date.strftime('%b %d'),
                'gameTime':   g.get('gameDateTimeEst', ''),
                'arena':      g.get('arenaName', ''),
                'home': {
                    'tricode':  home_tri,
                    'name':     g.get('homeTeam', {}).get('teamName', ''),
                    'city':     g.get('homeTeam', {}).get('teamCity', ''),
                    'score':    0,
                    'logo':     TEAM_LOGOS.get(home_tri, ''),
                    'quarters': [],
                    'record':   '',
                },
                'away': {
                    'tricode':  away_tri,
                    'name':     g.get('awayTeam', {}).get('teamName', ''),
                    'city':     g.get('awayTeam', {}).get('teamCity', ''),
                    'score':    0,
                    'logo':     TEAM_LOGOS.get(away_tri, ''),
                    'quarters': [],
                    'record':   '',
                },
                'period':    0,
                'gameClock': '',
                'players': {
                    'home': _roster_from_pkl(home_tri, nba_data),
                    'away': _roster_from_pkl(away_tri, nba_data),
                },
            })

    return upcoming[:20]

def get_top_pra_player(nba_data, days=7):
    """Return the player with highest PPG+RPG+APG from pkl data (proxy for last week leader)."""
    if not nba_data:
        return None
    best = max(
        nba_data,
        key=lambda p: (p.get('PPG_LAST', 0) or 0) + (p.get('RPG_LAST', 0) or 0) + (p.get('APG_LAST', 0) or 0)
    )
    ppg = round(best.get('PPG_LAST', 0), 1)
    rpg = round(best.get('RPG_LAST', 0), 1)
    apg = round(best.get('APG_LAST', 0), 1)
    return {
        'name':     best.get('PLAYER_NAME', ''),
        'team':     best.get('TEAM', ''),
        'position': best.get('POSITION', ''),
        'ppg':      ppg,
        'rpg':      rpg,
        'apg':      apg,
        'pra':      round(ppg + rpg + apg, 1),
        'spg':      round(best.get('SPG_LAST', 0), 1),
        'bpg':      round(best.get('BPG_LAST', 0), 1),
        'player_id': best.get('PLAYER_ID'),
    }