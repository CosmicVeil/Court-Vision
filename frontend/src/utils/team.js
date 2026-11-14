// Helpers for the team page: paths, the NBA headshot CDN, and a summary of a team's games.

const HEADSHOT_SIZES = { small: '260x190', large: '1040x760' };
// Players the backend could not match to NBA.com get made-up IDs from here up; they have no photo.
const FALLBACK_ID_START = 900_000_000;
const REGULAR_SEASON = 2;

export const cleanTricode = tricode => String(tricode || '').trim().toUpperCase();

export const getTeamPath = tricode => `/teams/${encodeURIComponent(cleanTricode(tricode))}`;
export const buildTeamEndpoint = tricode => `teams/${encodeURIComponent(cleanTricode(tricode))}`;

// The official headshot for an NBA.com person ID, or '' when there cannot be one.
export function getHeadshotUrl(playerId, size = 'small') {
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0 || id >= FALLBACK_ID_START) return '';
  return `https://cdn.nba.com/headshots/nba/latest/${Object.hasOwn(HEADSHOT_SIZES, size) ? HEADSHOT_SIZES[size] : HEADSHOT_SIZES.small}/${id}.png`;
}

const record = games => `${games.filter(g => g.result === 'W').length}-${games.filter(g => g.result === 'L').length}`;

// Home and away records plus the current streak, from regular-season games listed newest first.
export function summarizeGames(games) {
  const played = (Array.isArray(games) ? games : [])
    .filter(g => g && g.season_type === REGULAR_SEASON && (g.result === 'W' || g.result === 'L'));
  let streak = 0;
  while (streak < played.length && played[streak].result === played[0].result) streak += 1;
  return {
    home: record(played.filter(g => g.is_home)),
    away: record(played.filter(g => !g.is_home)),
    streak: played.length ? `${played[0].result}${streak}` : '',
  };
}

// "123-112", with "OT" or "2OT" after an overtime game; '' without a score.
export function formatScore(game) {
  if (!game?.score) return '';
  const overtimes = Number(game.overtimes) || 0;
  return overtimes > 0 ? `${game.score} ${overtimes > 1 ? overtimes : ''}OT` : game.score;
}

// Each team's full name and main colour (the banner behind its name). Teams whose main colour is
// close to black or navy use their brighter second colour, so it still shows on the dark page.
export const TEAMS = {
  ATL: { name: 'Atlanta Hawks', color: '#E03A3E' }, BOS: { name: 'Boston Celtics', color: '#007A33' },
  BKN: { name: 'Brooklyn Nets', color: '#9A9A9E' }, CHA: { name: 'Charlotte Hornets', color: '#00788C' },
  CHI: { name: 'Chicago Bulls', color: '#CE1141' }, CLE: { name: 'Cleveland Cavaliers', color: '#860038' },
  DAL: { name: 'Dallas Mavericks', color: '#00538C' }, DEN: { name: 'Denver Nuggets', color: '#FEC524' },
  DET: { name: 'Detroit Pistons', color: '#C8102E' }, GSW: { name: 'Golden State Warriors', color: '#FFC72C' },
  HOU: { name: 'Houston Rockets', color: '#CE1141' }, IND: { name: 'Indiana Pacers', color: '#FDBB30' },
  LAC: { name: 'LA Clippers', color: '#C8102E' }, LAL: { name: 'Los Angeles Lakers', color: '#552583' },
  MEM: { name: 'Memphis Grizzlies', color: '#5D76A9' }, MIA: { name: 'Miami Heat', color: '#98002E' },
  MIL: { name: 'Milwaukee Bucks', color: '#00471B' }, MIN: { name: 'Minnesota Timberwolves', color: '#236192' },
  NOP: { name: 'New Orleans Pelicans', color: '#B4975A' }, NYK: { name: 'New York Knicks', color: '#006BB6' },
  OKC: { name: 'Oklahoma City Thunder', color: '#007AC1' }, ORL: { name: 'Orlando Magic', color: '#0077C0' },
  PHI: { name: 'Philadelphia 76ers', color: '#006BB6' }, PHX: { name: 'Phoenix Suns', color: '#E56020' },
  POR: { name: 'Portland Trail Blazers', color: '#E03A3E' }, SAC: { name: 'Sacramento Kings', color: '#5A2D81' },
  SAS: { name: 'San Antonio Spurs', color: '#C4CED4' }, TOR: { name: 'Toronto Raptors', color: '#CE1141' },
  UTA: { name: 'Utah Jazz', color: '#753BBD' }, WAS: { name: 'Washington Wizards', color: '#E31837' },
};
const DEFAULT_TEAM_COLOR = '#ff6436';

export const getTeamColor = tricode => (Object.hasOwn(TEAMS, cleanTricode(tricode))
  ? TEAMS[cleanTricode(tricode)].color : DEFAULT_TEAM_COLOR);

const regularSeason = games => (Array.isArray(games) ? games : [])
  .filter(g => g && g.season_type === REGULAR_SEASON && (g.result === 'W' || g.result === 'L'));

// Points scored and allowed per regular-season game, read from each "team-opponent" score.
export function getScoringAverages(games) {
  const scores = regularSeason(games)
    // Only a full "123-112" counts: Number('') is 0, so a half-empty score must not parse.
    .map(g => /^(\d+)-(\d+)$/.exec(String(g.score ?? '')))
    .filter(Boolean)
    .map(match => [Number(match[1]), Number(match[2])]);
  if (!scores.length) return { ppg: null, oppPpg: null };
  const average = index => Math.round((scores.reduce((sum, pair) => sum + pair[index], 0) / scores.length) * 10) / 10;
  return { ppg: average(0), oppPpg: average(1) };
}

// The latest regular-season results, oldest first, the way a form guide reads (left to right).
export const getRecentForm = (games, count = 5) => regularSeason(games).slice(0, count).map(g => g.result).reverse();

// The same games (newest first) with the team's regular-season record after each one. Games
// outside the regular season, or without a result, get record ''.
export function withRunningRecord(games) {
  const list = Array.isArray(games) ? games.filter(Boolean) : [];
  let wins = 0;
  let losses = 0;
  const records = new Map();
  for (const game of [...list].reverse()) {
    if (game.season_type !== REGULAR_SEASON || (game.result !== 'W' && game.result !== 'L')) continue;
    if (game.result === 'W') wins += 1; else losses += 1;
    records.set(game, `${wins}-${losses}`);
  }
  return list.map(game => ({ ...game, record: records.get(game) || '' }));
}

const LEADER_STATS = [['ppg', 'Points'], ['rpg', 'Rebounds'], ['apg', 'Assists']];

// The roster's best scorer, rebounder and passer. A stat nobody has above zero has no leader.
export function getTeamLeaders(roster) {
  const players = Array.isArray(roster) ? roster.filter(Boolean) : [];
  return LEADER_STATS.flatMap(([key, label]) => {
    const player = players.reduce((best, p) => ((Number(p[key]) || 0) > (Number(best?.[key]) || 0) ? p : best), null);
    return player ? [{ key, label, player, value: Number(player[key]) }] : [];
  });
}
