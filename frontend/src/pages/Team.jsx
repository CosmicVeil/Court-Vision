import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import InjuryBadge from '../components/InjuryBadge';
import PillNav from '../components/PillNav';
import PlayerHeadshot from '../components/PlayerHeadshot';
import PlayerStatsModal from '../components/PlayerStatsModal';
import { getScoring } from '../utils/auth';
import { fptsTitle } from '../utils/fantasy';
import { getGameDetailPath } from '../utils/liveGames';
import { buildPlayerFallback, fetchPlayerDetails } from '../utils/playerDetails';
import {
  buildTeamEndpoint, formatScore, getRecentForm, getScoringAverages, getTeamColor, getTeamLeaders, getTeamPath,
  summarizeGames, withRunningRecord,
} from '../utils/team';
import './Team.css';

const SEASON_TYPE_TAGS = { 3: 'POST', 5: 'PLAY-IN' };

const formatDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const stat = value => (value === null || value === undefined ? '—' : Number(value).toFixed(1));
const pct = value => (value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`);

// The roster's stat columns, the same fields the Stats page lists for each player.
const ROSTER_STATS = [
  ['ppg', 'PPG', 'Points per game'], ['rpg', 'RPG', 'Rebounds per game'], ['apg', 'APG', 'Assists per game'],
  ['spg', 'SPG', 'Steals per game'], ['bpg', 'BPG', 'Blocks per game'],
  ['fg_pct', 'FG%', 'Field goal percentage'], ['fg3_pct', '3P%', 'Three-point percentage'],
  ['ft_pct', 'FT%', 'Free throw percentage'], ['fpts', 'FPTS', 'Fantasy points per game'],
];

// The banner: who the team is on the left, how its season is going on the right.
function TeamHero({ team, record, games, seasonLabel, gamesAvailable, gamesMissing }) {
  const summary = summarizeGames(games);
  const averages = getScoringAverages(games);
  const form = getRecentForm(games);
  // When the archive is missing games the backend sends the record, splits and streak from the
  // league standings; the ones worked out from archived games would be wrong.
  const hasRecord = gamesAvailable || record.source === 'standings';
  const streak = record.streak || summary.streak;
  const stats = [
    ['Home', record.home || (gamesAvailable ? summary.home : '—')],
    ['Away', record.away || (gamesAvailable ? summary.away : '—')],
    ['PPG', stat(averages.ppg)],
    ['Opp PPG', stat(averages.oppPpg)],
  ];
  return (
    <header className="tp-hero">
      <Link to="/standings" className="tp-back">← ALL TEAMS</Link>
      <div className="tp-hero-main">
        {team.logo && <img src={team.logo} alt="" className="tp-logo" />}
        <div className="tp-identity">
          <span className="tp-eyebrow" data-slot="eyebrow">{seasonLabel} SEASON</span>
          <h1 className="tp-title" data-slot="display-heading">
            <span className="tp-city">{team.city}</span> <span className="tp-name">{team.name}</span>
          </h1>
          <p className="tp-standing">
            <span className="tp-record" data-numeric>{hasRecord ? `${record.wins}-${record.losses}` : '—'}</span>
            {streak && <span className="tp-streak" data-result={streak[0]} data-numeric>{streak}</span>}
            {form.length > 0 && (
              <span className="tp-form" role="img" aria-label={`Last ${form.length} games, oldest first: ${form.join(' ')}`}>
                {form.map((result, index) => <span key={index} className="tp-form-pill" data-result={result} aria-hidden="true">{result}</span>)}
              </span>
            )}
          </p>
          {gamesAvailable && gamesMissing > 0 && (
            <p className="tp-partial">
              Record from the standings. Scoring averages and recent form cover the {games.length} archived
              {' '}games only ({gamesMissing} missing).
            </p>
          )}
        </div>
      </div>
      <dl className="tp-hero-stats">
        {stats.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd data-numeric>{value}</dd></div>
        ))}
      </dl>
    </header>
  );
}

function Leaders({ roster, onSelect }) {
  const leaders = getTeamLeaders(roster);
  if (!leaders.length) return null;
  return (
    <section className="tp-leaders" aria-label="Team leaders">
      {leaders.map(({ key, label, player, value }) => (
        <button key={key} type="button" className="tp-leader" onClick={() => onSelect(player)}>
          <span className="tp-leader-text">
            <span className="tp-leader-label">{label} per game</span>
            <span className="tp-leader-value" data-numeric>{stat(value)}</span>
            <span className="tp-leader-name">{player.name}</span>
            <span className="tp-leader-pos">{player.position}</span>
          </span>
          <PlayerHeadshot playerId={player.id} name={player.name} className="tp-leader-photo" />
        </button>
      ))}
    </section>
  );
}

function Roster({ roster, onSelect }) {
  if (!roster.length) return <p className="tp-empty">No roster data for this team yet.</p>;
  return (
    <div className="tp-table-wrap">
      <table className="tp-table tp-roster">
        <thead>
          <tr>
            <th scope="col" className="tp-left">Player</th>
            <th scope="col">Pos</th><th scope="col">Age</th><th scope="col">GP</th>
            {ROSTER_STATS.map(([key, label, title]) => (
              <th key={key} scope="col" title={key === 'fpts' ? fptsTitle(getScoring()) : title}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roster.map(player => (
            // The whole row opens the player; the name is a real button so the keyboard can too.
            <tr key={player.id} className="tp-player-row" onClick={() => onSelect(player)}>
              <td className="tp-left">
                <span className="tp-player">
                  <PlayerHeadshot playerId={player.id} name={player.name} />
                  <button type="button" className="tp-player-name">{player.name}</button>
                  <InjuryBadge injury={player.injury} />
                </span>
              </td>
              <td>{player.position}</td>
              <td>{player.age ?? '—'}</td>
              <td>{player.games_played}</td>
              {ROSTER_STATS.map(([key]) => (
                <td key={key} className={key === 'ppg' ? 'tp-strong' : undefined}>
                  {key.endsWith('_pct') ? pct(player[key]) : stat(player[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One line per game. The result link is stretched over the whole line (its ::after covers the
// row), so clicking anywhere opens the game; the opponent link sits above it and opens that team.
function SeasonGames({ games, available, missing = 0 }) {
  if (!available) return <p className="tp-empty">Game results are unavailable right now.</p>;
  if (!games.length) {
    return <p className="tp-empty">{missing > 0 ? `None of this season's ${missing} games are archived yet.` : 'No games played yet this season.'}</p>;
  }
  // A running record counted from an incomplete list would be wrong on every line, so it is
  // only shown when the archive has every game.
  const rows = missing > 0 ? games.map(game => ({ ...game, record: '' })) : withRunningRecord(games);
  return (
    <div className="tp-games-wrap">
      {missing > 0 && (
        <p className="tp-games-note">Showing {games.length} of {games.length + missing} games. The rest are not in the archive.</p>
      )}
      <div className="tp-game tp-games-head" aria-hidden="true">
        <span>Date</span><span>Opponent</span><span>Result</span><span className="tp-game-record">{missing > 0 ? '' : 'Record'}</span><span />
      </div>
      <ul className="tp-games">
        {rows.map(game => (
          <li key={game.game_id} className="tp-game" data-linked={game.score ? '' : undefined}>
            <span className="tp-game-date">
              {formatDate(game.date)}
              {SEASON_TYPE_TAGS[game.season_type] && <span className="tp-tag">{SEASON_TYPE_TAGS[game.season_type]}</span>}
            </span>
            <Link to={getTeamPath(game.opponent)} className="tp-opponent">
              <span className="tp-venue">{game.is_home ? 'vs' : '@'}</span>
              {game.opponent_logo && <img src={game.opponent_logo} alt="" className="tp-opponent-logo" loading="lazy" />}
              <span className="tp-opponent-name">{game.opponent_name || game.opponent}</span>
              <span className="tp-opponent-tricode">{game.opponent}</span>
            </Link>
            {game.score ? (
              <Link to={getGameDetailPath(game.game_id)} className="tp-game-link"
                aria-label={`${game.result === 'W' ? 'Win' : 'Loss'} ${formatScore(game)} ${game.is_home ? 'against' : 'at'} ${game.opponent_name || game.opponent}, ${formatDate(game.date)}. Open game.`}>
                <span className="tp-result" data-result={game.result}>{game.result}</span>
                <span className="tp-score" data-numeric>{formatScore(game)}</span>
              </Link>
            ) : <span className="tp-result">—</span>}
            <span className="tp-game-record" data-numeric>{game.record}</span>
            <span className="tp-game-arrow" aria-hidden="true">{game.score ? '→' : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Team() {
  const { tricode } = useParams();
  // Keyed by team, so moving to another team shows the loading state instead of the old team.
  const [result, setResult] = useState({ tricode: null, status: 'loading', data: null });
  const [tab, setTab] = useState('roster');
  const [player, setPlayer] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const playerRequestRef = useRef(null);

  useEffect(() => {
    // Aborting on cleanup drops a slow response for a team the user has already left.
    const controller = new AbortController();
    fetch(buildApiUrl(buildTeamEndpoint(tricode)), { signal: controller.signal })
      .then(response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Unable to load this team');
        return response.json();
      })
      .then(data => setResult({ tricode, status: data ? 'ready' : 'missing', data }))
      .catch(error => {
        if (error.name !== 'AbortError') setResult({ tricode, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [tricode]);

  useEffect(() => () => playerRequestRef.current?.abort(), []);

  const closePlayer = useCallback(() => {
    playerRequestRef.current?.abort();
    playerRequestRef.current = null;
    setPlayerLoading(false);
    setPlayer(null);
  }, []);

  const selectPlayer = useCallback(async selected => {
    playerRequestRef.current?.abort();
    const controller = new AbortController();
    playerRequestRef.current = controller;
    // If the detail lookup fails, the popout is built from this row, so hand it every stat the
    // row shows (under the box-score names buildPlayerFallback reads) or it would show zeros.
    const fallback = {
      ...selected, team: tricode.toUpperCase(),
      pts: selected.ppg, reb: selected.rpg, ast: selected.apg, stl: selected.spg, blk: selected.bpg,
    };
    setPlayer(null);
    setPlayerLoading(true);
    try {
      setPlayer(await fetchPlayerDetails(fallback, controller.signal));
    } catch (reason) {
      if (reason.name !== 'AbortError') setPlayer(buildPlayerFallback(fallback));
    } finally {
      if (playerRequestRef.current === controller) {
        playerRequestRef.current = null;
        setPlayerLoading(false);
      }
    }
  }, [tricode]);

  const status = result.tricode === tricode ? result.status : 'loading';
  // The team's own colour tints the banner; everything else stays in the site's palette.
  const pageStyle = { '--team-color': getTeamColor(tricode) };

  if (status !== 'ready') {
    return (
      <div className="tp-page" style={pageStyle}>
        <div className="tp-shell">
          <header className="tp-hero">
            <Link to="/standings" className="tp-back">← ALL TEAMS</Link>
            <h1 className="tp-title" data-slot="display-heading">NBA <span className="tp-name">TEAM</span></h1>
          </header>
          <div className="tp-empty" role="status">
            {status === 'loading' ? 'Loading team…'
              : status === 'missing' ? `No NBA team matches "${tricode}".`
                : 'Unable to load this team. Make sure the API server is running.'}
          </div>
        </div>
      </div>
    );
  }

  const {
    team, record, games, roster, season_label: seasonLabel, games_available: gamesAvailable,
    games_missing: gamesMissing = 0,
  } = result.data;

  return (
    <div className="tp-page" style={pageStyle}>
      <div className="tp-shell">
        <TeamHero team={team} record={record} games={games} seasonLabel={seasonLabel} gamesAvailable={gamesAvailable}
          gamesMissing={gamesMissing} />
        <Leaders roster={roster} onSelect={selectPlayer} />
        <PillNav className="tp-tabs" tabClassName="tp-tab" label="Team sections" idPrefix="tp" panelId="tp-panel"
          value={tab} onChange={setTab}
          items={[
            { id: 'roster', label: <>Roster <span className="tp-tab-count" data-numeric>{roster.length}</span></> },
            { id: 'games', label: <>Games <span className="tp-tab-count" data-numeric>{games.length}</span></> },
          ]} />
        <section className="tp-section" id="tp-panel" role="tabpanel" aria-labelledby={`tp-tab-${tab}`}>
          {tab === 'roster'
            ? <Roster roster={roster} onSelect={selectPlayer} />
            : <SeasonGames games={games} available={gamesAvailable} missing={gamesMissing} />}
        </section>
      </div>
      <PlayerStatsModal player={player} loading={playerLoading} onClose={closePlayer} />
    </div>
  );
}
