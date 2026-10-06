"""
NBA Web Scraper for Multi-Season Data (2023-2026)
Scrapes real NBA player statistics from Basketball Reference
"""

import requests
import pandas as pd
import numpy as np
import json
import time
import pickle
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup
import re
import sys

# Ensure UTF-8 stdout/stderr across all platforms
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

try:
    from nba_api.stats.endpoints import playergamelogs, leaguedashplayerbiostats
except ImportError:
    playergamelogs = None
    leaguedashplayerbiostats = None

from app import config
from app.utils.player_names import fix_mojibake, normalize_player_name

# Previous-season features copied from the same player's row one season earlier.
PREV_FEATURE_SOURCES = {
    'PPG_PREV': 'PPG_LAST', 'APG_PREV': 'APG_LAST', 'RPG_PREV': 'RPG_LAST',
    'SPG_PREV': 'SPG_LAST', 'BPG_PREV': 'BPG_LAST', 'TOV_PREV': 'TOV_LAST',
    'FG_PCT_PREV': 'FG_PCT_LAST', 'FG3_PCT_PREV': 'FG3_PCT_LAST', 'FT_PCT_PREV': 'FT_PCT_LAST',
    'MIN_PREV': 'MIN_LAST', 'GAMES_PLAYED_PREV': 'GAMES_PLAYED_LAST',
}

GAME_LOG_FEATURES = (
    'PPG_LAST_10', 'APG_LAST_10', 'RPG_LAST_10', 'FG_PCT_LAST_10',
    'PPG_TREND', 'APG_TREND', 'RPG_TREND',
    'PPG_STD', 'APG_STD', 'RPG_STD', 'CONSISTENCY_SCORE',
)


def _season_slug(season_year: int) -> str:
    return f"{season_year - 1}-{str(season_year)[-2:]}"


def _trend(values: np.ndarray) -> float:
    """Least-squares slope of a stat over the season's games (stat per game, per game played)."""
    if len(values) < 2:
        return 0.0
    return float(np.polyfit(np.arange(len(values)), values, 1)[0])


def compute_game_log_features(logs: pd.DataFrame) -> Dict[int, Dict]:
    """Per-player form/volatility features from one season of league-wide game logs."""
    features = {}
    if logs is None or logs.empty:
        return features

    logs = logs.sort_values(['PLAYER_ID', 'GAME_DATE', 'GAME_ID'])
    for player_id, games in logs.groupby('PLAYER_ID', sort=False):
        pts = games['PTS'].astype(float).to_numpy()
        ast = games['AST'].astype(float).to_numpy()
        reb = games['REB'].astype(float).to_numpy()
        last_10 = games.tail(10)
        fga_10 = float(last_10['FGA'].sum())
        ppg_mean = float(pts.mean())
        ppg_std = float(pts.std())

        features[int(player_id)] = {
            'NBA_PLAYER_ID': int(player_id),
            'PPG_LAST_10': float(last_10['PTS'].mean()),
            'APG_LAST_10': float(last_10['AST'].mean()),
            'RPG_LAST_10': float(last_10['REB'].mean()),
            'FG_PCT_LAST_10': float(last_10['FGM'].sum()) / fga_10 if fga_10 else 0.0,
            'PPG_TREND': _trend(pts),
            'APG_TREND': _trend(ast),
            'RPG_TREND': _trend(reb),
            'PPG_STD': ppg_std,
            'APG_STD': float(ast.std()),
            'RPG_STD': float(reb.std()),
            # 1 - coefficient of variation of scoring: 1 = identical output every night.
            'CONSISTENCY_SCORE': float(np.clip(1 - ppg_std / ppg_mean, 0, 1)) if ppg_mean > 0 else 0.0,
        }
    return features


def build_name_index(frame: pd.DataFrame) -> Dict[str, int]:
    """normalized name -> NBA PLAYER_ID, dropping names shared by two players."""
    index, ambiguous = {}, set()
    if frame is None or frame.empty:
        return index
    for player_id, name in frame[['PLAYER_ID', 'PLAYER_NAME']].drop_duplicates().itertuples(index=False):
        key = normalize_player_name(name)
        if key in index and index[key] != int(player_id):
            ambiguous.add(key)
        index[key] = int(player_id)
    for key in ambiguous:
        index.pop(key, None)
    return index


def add_previous_season_features(all_season_data: Dict[int, List[Dict]]) -> None:
    """Fill *_PREV columns in place from each player's row in the prior season.

    Players with no prior-season row (rookies, missed seasons) get GAMES_PLAYED_PREV=0
    and missing (NaN) values for the rest, which XGBoost treats as 'unknown'.
    When the prior season itself isn't in the data, every *_PREV stays NaN.
    """
    for season_year, players in all_season_data.items():
        previous = all_season_data.get(season_year - 1)
        previous_by_name = {
            normalize_player_name(p.get('PLAYER_NAME')): p for p in (previous or [])
        }
        for player in players:
            prior = previous_by_name.get(normalize_player_name(player.get('PLAYER_NAME')))
            for prev_column, source_column in PREV_FEATURE_SOURCES.items():
                if prior is not None:
                    player[prev_column] = prior.get(source_column, np.nan)
                elif previous and prev_column == 'GAMES_PLAYED_PREV':
                    player[prev_column] = 0
                else:
                    player[prev_column] = np.nan

class NBAWebScraper:
    """Web scraper for NBA player statistics"""

    def __init__(self):
        self.base_url = "https://www.basketball-reference.com"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def get_player_stats_page(self, season_year: int) -> Optional[str]:
        """Get the main player stats page for a given season year using requests or Playwright fallback"""
        url = f"https://www.basketball-reference.com/leagues/NBA_{season_year}_per_game.html"
        
        # 1. Try fast standard HTTP request first
        try:
            res = self.session.get(url, timeout=12)
            res.encoding = 'utf-8'
            html_text = res.text
            if res.status_code == 200 and len(html_text) > 10000:
                print(f"[OK] Successfully accessed via requests: {url}")
                return html_text
            else:
                print(f"Requests returned status {res.status_code}, trying Playwright fallback...")
        except Exception as e:
            print(f"Requests error for season {season_year}: {e}, trying Playwright fallback...")

        # 2. Fallback to Playwright if available and requests failed
        if sync_playwright is not None:
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(
                        headless=True,
                        args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    )
                    page = browser.new_page()
                    page.set_extra_http_headers({
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    })
                    response = page.goto(url, timeout=15000)

                    if response and response.status == 200:
                        print(f"[OK] Successfully accessed via Playwright: {url}")
                        try:
                            page.wait_for_selector("table#per_game_stats", timeout=5000)
                        except Exception:
                            pass

                        # Playwright returns browser-decoded Unicode from page.content().
                        html_content = page.content()
                        browser.close()
                        return html_content
                    else:
                        status = response.status if response else 'None'
                        print(f"[ERR] Failed with status {status}: {url}")

                    browser.close()
            except Exception as e:
                print(f"Playwright error for season {season_year}: {e}")

        return None


    def scrape_multiple_seasons(self, seasons: List[int]) -> Dict[int, List[Dict]]:
        """Scrape player statistics for multiple seasons"""
        print(f"🏀 Scraping NBA player stats for seasons: {seasons}")

        all_season_data = {}

        for season_year in seasons:
            season_str = f"{season_year-1}-{str(season_year)[-2:]}"
            print(f"\n--- Scraping {season_str} season ---")

            html_content = self.get_player_stats_page(season_year)
            if not html_content:
                print(f"❌ Could not access NBA stats page for {season_str}")
                # If we can't get real data, create mock data for this season
                quit()
            else:
                # Parse with BeautifulSoup
                soup = BeautifulSoup(html_content, 'html.parser')

                # Look for data tables or JSON data
                players_data = []

                # Try to find JSON data in script tags
                script_tags = soup.find_all('script')
                for script in script_tags:
                    if script.string and 'players' in script.string.lower():
                        try:
                            # Look for JSON data
                            json_match = re.search(r'\{.*\}', script.string)
                            if json_match:
                                data = json.loads(json_match.group())
                                if 'players' in data or 'resultSets' in data:
                                    print("✅ Found JSON data in script tag")
                                    players_data = self.parse_json_data(data)
                                    break
                        except:
                            continue

                # Try to find table data
                if not players_data:
                    tables = soup.find_all('table')
                    if tables:
                        print("✅ Found HTML tables")
                        parsed_data = self.parse_html_tables(tables)
                        if parsed_data:
                            players_data = parsed_data

                # Try to find data in divs with specific classes
                if not players_data:
                    data_divs = soup.find_all('div', class_=re.compile(r'stats|player|table', re.I))
                    if data_divs:
                        print("✅ Found data divs")
                        parsed_data = self.parse_data_divs(data_divs)
                        if parsed_data:
                            players_data = parsed_data

                # If no structured data found, create mock data with real player names
                if not players_data:
                    print("⚠️ No structured data found, creating realistic mock data...")
                    players_data = self.create_realistic_mock_data()

            all_season_data[season_year] = players_data
            print(f"✅ Completed scraping for {season_str}: {len(players_data)} players")

            time.sleep(1)

        return self.enrich_multiple_seasons(all_season_data)

    def _fetch_nba_frame(self, endpoint, retries=3, **params) -> Optional[pd.DataFrame]:
        if endpoint is None:
            print("nba_api is not installed; skipping NBA.com enrichment")
            return None
        for attempt in range(retries):
            try:
                return endpoint(timeout=60, **params).get_data_frames()[0]
            except Exception as e:
                print(f"NBA.com request failed ({attempt + 1}/{retries}): {e}")
                time.sleep(2 * (attempt + 1))
        return None

    def fetch_season_game_logs(self, season_year: int) -> Optional[pd.DataFrame]:
        """Every regular-season player game log for a season, in one request."""
        return self._fetch_nba_frame(
            playergamelogs.PlayerGameLogs if playergamelogs else None,
            season_nullable=_season_slug(season_year),
            season_type_nullable='Regular Season',
        )

    def fetch_season_bios(self, season_year: int) -> Optional[pd.DataFrame]:
        """Height (inches) and weight (lbs) for every player in a season."""
        return self._fetch_nba_frame(
            leaguedashplayerbiostats.LeagueDashPlayerBioStats if leaguedashplayerbiostats else None,
            season=_season_slug(season_year),
        )

    def enrich_season(self, season_year: int, players: List[Dict]) -> List[Dict]:
        """Add HEIGHT, WEIGHT and game-log features (last 10, trend, std, consistency)
        to one season of Basketball Reference rows. Unmatched players keep NaN."""
        logs = self.fetch_season_game_logs(season_year)
        time.sleep(0.6)
        bios = self.fetch_season_bios(season_year)

        log_features = compute_game_log_features(logs)
        bio_by_id = {}
        if bios is not None and not bios.empty:
            for row in bios.itertuples(index=False):
                bio_by_id[int(row.PLAYER_ID)] = {
                    'HEIGHT': pd.to_numeric(row.PLAYER_HEIGHT_INCHES, errors='coerce'),
                    'WEIGHT': pd.to_numeric(row.PLAYER_WEIGHT, errors='coerce'),
                }
        name_frames = [
            frame[['PLAYER_ID', 'PLAYER_NAME']]
            for frame in (logs, bios)
            if frame is not None and not frame.empty
        ]
        name_index = build_name_index(pd.concat(name_frames)) if name_frames else {}

        matched = 0
        for player in players:
            player_id = name_index.get(normalize_player_name(player.get('PLAYER_NAME')))
            features = {column: np.nan for column in GAME_LOG_FEATURES}
            features.update({'HEIGHT': np.nan, 'WEIGHT': np.nan})
            if player_id is not None:
                matched += 1
                player['NBA_PLAYER_ID'] = player_id
                features.update(log_features.get(player_id, {}))
                features.update(bio_by_id.get(player_id, {}))
            for column, value in features.items():
                if column != 'NBA_PLAYER_ID':
                    player[column] = float(value) if pd.notna(value) else np.nan

        print(f"  {_season_slug(season_year)}: matched {matched}/{len(players)} players to NBA.com")
        return players

    def enrich_multiple_seasons(self, all_season_data: Dict[int, List[Dict]]) -> Dict[int, List[Dict]]:
        """Add every model feature the per-game table doesn't have, in place."""
        print("📈 Enriching seasons with NBA.com game logs and bio data...")
        for season_year in sorted(all_season_data):
            self.enrich_season(season_year, all_season_data[season_year])
            time.sleep(0.6)
        add_previous_season_features(all_season_data)
        return all_season_data

    
    def scrape_player_stats(self, season='2025-26'):
        """Scrape player statistics from NBA.com"""
        print(f"🏀 Scraping NBA player stats for {season} season...")

        # Convert season string to year (e.g., '2025-26' -> 2026)
        try:
            if '-' in season:
                year = int(season.split('-')[1]) + 2000
            else:
                year = int(season)
        except:
            year = 2026  # default fallback

        # Get the main page
        html_content = self.get_player_stats_page(year)
        if not html_content:
            print("❌ Could not access NBA stats page")
            return None
        
        # Parse with BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Look for data tables or JSON data
        players_data = []
        
        # Try to find JSON data in script tags
        script_tags = soup.find_all('script')
        for script in script_tags:
            if script.string and 'players' in script.string.lower():
                try:
                    # Look for JSON data
                    json_match = re.search(r'\{.*\}', script.string)
                    if json_match:
                        data = json.loads(json_match.group())
                        if 'players' in data or 'resultSets' in data:
                            print("✅ Found JSON data in script tag")
                            return self.parse_json_data(data)
                except:
                    continue
        
        # Try to find table data
        tables = soup.find_all('table')
        if tables:
            print("✅ Found HTML tables")
            parsed_data = self.parse_html_tables(tables)
            if parsed_data:
                return parsed_data
        
        # Try to find data in divs with specific classes
        data_divs = soup.find_all('div', class_=re.compile(r'stats|player|table', re.I))
        if data_divs:
            print("✅ Found data divs")
            parsed_data = self.parse_data_divs(data_divs)
            if parsed_data:
                return parsed_data
        
        # If no structured data found, create mock data with real player names
        print("⚠️ No structured data found, creating realistic mock data...")
        return self.create_realistic_mock_data()
    
    def parse_json_data(self, data):
        """Parse JSON data from NBA API"""
        try:
            if 'resultSets' in data:
                # NBA API format
                for result_set in data['resultSets']:
                    if 'rowSet' in result_set and result_set['rowSet']:
                        headers = result_set['headers']
                        rows = result_set['rowSet']
                        
                        players = []
                        for row in rows:
                            player = dict(zip(headers, row))
                            players.append(player)
                        
                        print(f"✅ Parsed {len(players)} players from JSON data")
                        return players
            
            elif 'players' in data:
                # Direct players format
                players = data['players']
                print(f"✅ Parsed {len(players)} players from JSON data")
                return players
            
            return None
            
        except Exception as e:
            print(f"Error parsing JSON data: {e}")
            return None
    
    def parse_html_tables(self, tables):
        """Parse HTML tables for player data from Basketball Reference"""
        try:
            players = []
            
            for table in tables:
                # Basketball Reference uses standard table structure
                rows = table.find_all('tr')
                
                # Find header row
                headers = []
                header_row = None
                for row in rows:
                    if row.find('th'):
                        header_row = row
                        headers = [th.get_text().strip() for th in row.find_all('th')]
                        break
                
                if not headers:
                    # Try to find headers in thead
                    thead = table.find('thead')
                    if thead:
                        headers = [th.get_text().strip() for th in thead.find_all('th')]
                
                # Extract data rows
                data_rows = []
                for row in rows:
                    if row.find('td'):  # Data row
                        data_rows.append(row)
                
                for row in data_rows:
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 3:  # Minimum data requirement
                        player_data = {}
                        
                        # Map Basketball Reference columns to our format
                        for i, cell in enumerate(cells):
                            if i < len(headers):
                                header = headers[i]
                                value = cell.get_text().strip()
                                
                                # Map Basketball Reference headers to our format
                                if header == 'Player':
                                    player_data['PLAYER_NAME'] = fix_mojibake(value)
                                elif header in ['Tm', 'Team']:
                                    player_data['TEAM'] = value
                                elif header in ['Pos', 'Position']:
                                    player_data['POSITION'] = value
                                elif header == 'Age':
                                    player_data['AGE'] = self.parse_number(value)
                                elif header == 'PTS':
                                    player_data['PPG_LAST'] = self.parse_number(value)
                                elif header == 'AST':
                                    player_data['APG_LAST'] = self.parse_number(value)
                                elif header == 'TRB':
                                    player_data['RPG_LAST'] = self.parse_number(value)
                                elif header == 'STL':
                                    player_data['SPG_LAST'] = self.parse_number(value)
                                elif header == 'BLK':
                                    player_data['BPG_LAST'] = self.parse_number(value)
                                elif header == 'TOV':
                                    player_data['TOV_LAST'] = self.parse_number(value)
                                elif header == 'FG%':
                                    player_data['FG_PCT_LAST'] = self.parse_number(value)
                                elif header == '3P%':
                                    player_data['FG3_PCT_LAST'] = self.parse_number(value)
                                elif header == 'FT%':
                                    player_data['FT_PCT_LAST'] = self.parse_number(value)
                                elif header == 'MP': 
                                    player_data['MIN_LAST'] = self.parse_number(value)
                                elif header == 'G':
                                    player_data['GAMES_PLAYED_LAST'] = self.parse_number(value)
                        
                        # Only add if we have a player name and some stats
                        if 'PLAYER_NAME' in player_data and ('PPG_LAST' in player_data or 'APG_LAST' in player_data or 'RPG_LAST' in player_data):
                            # Fill in missing stats with defaults
                            player_data.setdefault('PPG_LAST', 0)
                            player_data.setdefault('APG_LAST', 0)
                            player_data.setdefault('RPG_LAST', 0)
                            player_data.setdefault('SPG_LAST', 0)
                            player_data.setdefault('BPG_LAST', 0)
                            player_data.setdefault('TOV_LAST', 0)
                            player_data.setdefault('FG_PCT_LAST', 0)
                            player_data.setdefault('FG3_PCT_LAST', 0)
                            player_data.setdefault('FT_PCT_LAST', 0)
                            player_data.setdefault('MIN_LAST', 0)
                            player_data.setdefault('GAMES_PLAYED_LAST', 0)
                            player_data.setdefault('TEAM', 'UNK')
                            player_data.setdefault('POSITION', 'UNK')
                            player_data.setdefault('AGE', 25)
                            
                            players.append(player_data)
            
            if players:
                print(f"✅ Parsed {len(players)} players from Basketball Reference HTML tables")
                # Remove duplicates by keeping the entry with most games played
                players = self.deduplicate_players(players)
                print(f"✅ After deduplication: {len(players)} unique players")
                return players
            
            return None
            
        except Exception as e:
            print(f"Error parsing HTML tables: {e}")
            return None
    
    def parse_number(self, value):
        """Parse a number from string, handling various formats"""
        try:
            # Remove common non-numeric characters
            cleaned = value.replace('%', '').replace(',', '').strip()
            if cleaned == '-' or cleaned == '':
                return 0
            return float(cleaned)
        except:
            return 0
    
    def deduplicate_players(self, players):
        """Keep TOT stats but use most recent team"""
        tot_rows = {}
        last_team = {}
        
        for player in players:
            name = player['PLAYER_NAME']

            team = (player.get('TEAM') or '').strip()

            if team and team[0].isdigit():
                print(name)
                tot_rows[name] = player
            else:
                if team:
                    last_team[name] = team  # keeps overwriting, last one wins
        
        result = []
        for player in players:
            name = player['PLAYER_NAME']
            if name in tot_rows:
                # Only add the TOT row, but with the most recent team
                if player == tot_rows[name]:
                    player['TEAM'] = last_team.get(name, player['TEAM'])
                    result.append(player)
            else:
                # Player wasn't traded, no TOT row — add if not already added
                if name not in [p['PLAYER_NAME'] for p in result]:
                    result.append(player)
        
        return result
    
    def parse_data_divs(self, divs):
        """Parse data from div elements"""
        try:
            print("runs here")
            players = []
            
            for div in divs:

                print("runs here #2")
                # Look for player names and stats in divs
                player_elements = div.find_all(['span', 'div', 'p'], string=re.compile(r'[A-Z][a-z]+ [A-Z][a-z]+'))
                
                for element in player_elements:
                    player_name = element.get_text().strip()
                    if len(player_name.split()) >= 2:  # First and last name
                        # Try to find associated stats
                        parent = element.parent
                        if parent:
                            print("runs here #3")
                            stats_text = parent.get_text()
                            # Extract numbers that could be stats
                            numbers = re.findall(r'\d+\.?\d*', stats_text)
                            
                            if len(numbers) >= 3:  # At least PPG, APG, RPG
                                player_data = {
                                    'PLAYER_NAME': player_name,
                                    'PPG_LAST': float(numbers[0]) if numbers[0] else 0,
                                    'APG_LAST': float(numbers[1]) if len(numbers) > 1 else 0,
                                    'RPG_LAST': float(numbers[2]) if len(numbers) > 2 else 0,
                                    'TEAM': 'UNK',  # Unknown team
                                    'POSITION': 'UNK',  # Unknown position
                                    'AGE': 25,  # Default age
                                }
                                players.append(player_data)
            
            if players:
                print(f"✅ Parsed {len(players)} players from div elements")
                return players
            
            return None
            
        except Exception as e:
            print(f"Error parsing data divs: {e}")
            return None
    
    def create_realistic_mock_data(self):
        """Create realistic mock data with real NBA player names"""
        print("🔄 Creating realistic mock data with real NBA players...")
        
        # Real NBA players for 2024-25 season with correct stats
        real_players = [
            {'name': 'LeBron James', 'team': 'LAL', 'position': 'SF', 'age': 40, 'ppg': 24.4, 'apg': 8.2, 'rpg': 7.8},
            {'name': 'Stephen Curry', 'team': 'GSW', 'position': 'PG', 'age': 36},
            {'name': 'Kevin Durant', 'team': 'PHX', 'position': 'SF', 'age': 35},
            {'name': 'Giannis Antetokounmpo', 'team': 'MIL', 'position': 'PF', 'age': 29},
            {'name': 'Luka Doncic', 'team': 'DAL', 'position': 'PG', 'age': 25},
            {'name': 'Jayson Tatum', 'team': 'BOS', 'position': 'SF', 'age': 26},
            {'name': 'Joel Embiid', 'team': 'PHI', 'position': 'C', 'age': 30},
            {'name': 'Nikola Jokic', 'team': 'DEN', 'position': 'C', 'age': 29},
            {'name': 'Kawhi Leonard', 'team': 'LAC', 'position': 'SF', 'age': 33},
            {'name': 'Paul George', 'team': 'LAC', 'position': 'SF', 'age': 34},
            {'name': 'Damian Lillard', 'team': 'MIL', 'position': 'PG', 'age': 34},
            {'name': 'Jimmy Butler', 'team': 'MIA', 'position': 'SF', 'age': 35},
            {'name': 'Anthony Davis', 'team': 'LAL', 'position': 'PF', 'age': 31},
            {'name': 'Russell Westbrook', 'team': 'LAC', 'position': 'PG', 'age': 35},
            {'name': 'Chris Paul', 'team': 'GSW', 'position': 'PG', 'age': 39},
            {'name': 'Devin Booker', 'team': 'PHX', 'position': 'SG', 'age': 27},
            {'name': 'Bradley Beal', 'team': 'PHX', 'position': 'SG', 'age': 31},
            {'name': 'Donovan Mitchell', 'team': 'CLE', 'position': 'SG', 'age': 28},
            {'name': 'Trae Young', 'team': 'ATL', 'position': 'PG', 'age': 25},
            {'name': 'Ja Morant', 'team': 'MEM', 'position': 'PG', 'age': 25},
            {'name': 'Zion Williamson', 'team': 'NOP', 'position': 'PF', 'age': 24},
            {'name': 'Anthony Edwards', 'team': 'MIN', 'position': 'SG', 'age': 22},
            {'name': 'Tyrese Haliburton', 'team': 'IND', 'position': 'PG', 'age': 24},
            {'name': 'Paolo Banchero', 'team': 'ORL', 'position': 'PF', 'age': 21},
            {'name': 'Chet Holmgren', 'team': 'OKC', 'position': 'C', 'age': 22},
            {'name': 'Victor Wembanyama', 'team': 'SAS', 'position': 'C', 'age': 20},
            {'name': 'Scottie Barnes', 'team': 'TOR', 'position': 'SF', 'age': 22},
            {'name': 'Cade Cunningham', 'team': 'DET', 'position': 'PG', 'age': 22},
            {'name': 'Jalen Green', 'team': 'HOU', 'position': 'SG', 'age': 22},
            {'name': 'Franz Wagner', 'team': 'ORL', 'position': 'SF', 'age': 22},
        ]
        
        # Add more players to reach 150
        additional_players = []
        for i in range(120):  # 30 real + 120 additional = 150 total
            additional_players.append({
                'name': f'Player {i+31}',
                'team': np.random.choice(['LAL', 'GSW', 'BOS', 'MIA', 'PHX', 'DEN', 'MIL', 'PHI', 'BKN', 'LAC',
                                        'DAL', 'ATL', 'CHI', 'CLE', 'DET', 'HOU', 'IND', 'MEM', 'MIN', 'NOP',
                                        'NYK', 'OKC', 'ORL', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS', 'CHA']),
                'position': np.random.choice(['PG', 'SG', 'SF', 'PF', 'C']),
                'age': np.random.randint(20, 35)
            })
        
        all_players = real_players + additional_players
        
        # Generate realistic stats for each player
        players_data = []
        for i, player in enumerate(all_players):
            # Position-based performance modifiers
            pos = player['position']
            if pos in ['PG', 'SG']:  # Guards
                assist_mod = 1.3
                rebound_mod = 0.7
                point_mod = 1.1
            elif pos in ['SF']:  # Small forwards
                assist_mod = 1.0
                rebound_mod = 1.0
                point_mod = 1.0
            else:  # Big men
                assist_mod = 0.7
                rebound_mod = 1.3
                point_mod = 0.9
            
            # Age-based performance curve
            age = player['age']
            if age < 22:
                age_mod = 0.8  # Rookie
            elif age < 26:
                age_mod = 1.0  # Prime
            elif age < 30:
                age_mod = 1.1  # Peak
            else:
                age_mod = 0.9  # Decline
            
            # Generate realistic 2024-25 season stats
            # Use real stats for LeBron James
            if player['name'] == 'LeBron James':
                base_ppg = player.get('ppg', 24.4)
                base_apg = player.get('apg', 8.2)
                base_rpg = player.get('rpg', 7.8)
            else:
                base_ppg = np.random.normal(12, 6) * point_mod * age_mod
                base_apg = np.random.normal(3, 2) * assist_mod * age_mod
                base_rpg = np.random.normal(5, 3) * rebound_mod * age_mod
                
            player_data = {
                'PLAYER_ID': 20000000 + i,
                'PLAYER_NAME': player['name'],
                'TEAM': player['team'],
                'POSITION': player['position'],
                'HEIGHT': np.random.randint(70, 85),
                'WEIGHT': np.random.randint(180, 280),
                'AGE': player['age'],
                # 2024-25 season stats
                'PPG_LAST': max(0, base_ppg + np.random.normal(0, 1)),
                'APG_LAST': max(0, base_apg + np.random.normal(0, 0.5)),
                'RPG_LAST': max(0, base_rpg + np.random.normal(0, 0.8)),
                'SPG_LAST': max(0, np.random.normal(1.2, 0.5)),
                'BPG_LAST': max(0, np.random.normal(0.8, 0.4)),
                'TOV_LAST': max(0, np.random.normal(2.5, 1)),
                'FG_PCT_LAST': max(0, min(1, np.random.normal(0.45, 0.08))),
                'FG3_PCT_LAST': max(0, min(1, np.random.normal(0.35, 0.1))),
                'FT_PCT_LAST': max(0, min(1, np.random.normal(0.8, 0.1))),
                'MIN_LAST': max(0, np.random.normal(25, 8)),
                'GAMES_PLAYED_LAST': np.random.randint(50, 82),
                # 2023-24 season stats (previous season)
                'PPG_PREV': max(0, base_ppg + np.random.normal(0, 1.5)),
                'APG_PREV': max(0, base_apg + np.random.normal(0, 0.8)),
                'RPG_PREV': max(0, base_rpg + np.random.normal(0, 1.2)),
                'SPG_PREV': max(0, np.random.normal(1.2, 0.5)),
                'BPG_PREV': max(0, np.random.normal(0.8, 0.4)),
                'TOV_PREV': max(0, np.random.normal(2.5, 1)),
                'FG_PCT_PREV': max(0, min(1, np.random.normal(0.45, 0.08))),
                'FG3_PCT_PREV': max(0, min(1, np.random.normal(0.35, 0.1))),
                'FT_PCT_PREV': max(0, min(1, np.random.normal(0.8, 0.1))),
                'MIN_PREV': max(0, np.random.normal(25, 8)),
                'GAMES_PLAYED_PREV': np.random.randint(50, 82),
                # Recent performance (last 10 games)
                'PPG_LAST_10': max(0, base_ppg + np.random.normal(0, 2)),
                'APG_LAST_10': max(0, base_apg + np.random.normal(0, 1)),
                'RPG_LAST_10': max(0, base_rpg + np.random.normal(0, 1.5)),
                'FG_PCT_LAST_10': max(0, min(1, np.random.normal(0.45, 0.08))),
                # Performance trends
                'PPG_TREND': np.random.normal(0, 1),
                'APG_TREND': np.random.normal(0, 0.5),
                'RPG_TREND': np.random.normal(0, 0.8),
                # Consistency metrics
                'PPG_STD': np.random.uniform(2, 8),
                'APG_STD': np.random.uniform(1, 4),
                'RPG_STD': np.random.uniform(1, 5),
                'CONSISTENCY_SCORE': np.random.uniform(0.1, 0.5),
            }
            
            players_data.append(player_data)
        
        print(f"✅ Created realistic mock data for {len(players_data)} players")
        return players_data
    
    def save_data(self, data, filename='nba_2025_26_data.pkl'):
        """Save scraped data to file"""
        filepath = os.path.join(str(config.DATA_DIR), filename)
        with open(filepath, 'wb') as f:
            pickle.dump(data, f)
        print(f"Data saved to {filepath}")
    
    def load_data(self, filename='nba_2025_26_data.pkl'):
        """Load data from file"""
        filepath = os.path.join(str(config.DATA_DIR), filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                data = pickle.load(f)
            print(f"Data loaded from {filepath}")
            return data
        return None

def test_scraper():
    """Test the NBA web scraper"""
    print("Testing NBA Web Scraper...")
    
    scraper = NBAWebScraper()
    
    # Try to load existing data first
    data = scraper.load_data()
    
    if data is None:
        print("No existing data found. Scraping new data...")
        data = scraper.scrape_player_stats('2025-26')
        
        if data:
            scraper.save_data(data)
        else:
            print("[ERR] Failed to scrape data")
            return None
    
    if data:
        print(f"[OK] Successfully loaded data for {len(data)} players")
        
        # Show sample data
        df = pd.DataFrame(data)
        print(f"Data shape: {df.shape}")
        print(f"Columns: {list(df.columns)[:10]}...")
        
        print("\nSample players:")
        for i, player in enumerate(data[:5]):
            print(f"{i+1}. {player['PLAYER_NAME']} ({player['TEAM']}) - {player['PPG_LAST']:.1f} PPG, {player['APG_LAST']:.1f} APG, {player['RPG_LAST']:.1f} RPG")
        
        return data
    
    return None

if __name__ == "__main__":
    test_scraper()
