import { useEffect, useState } from 'react';
import PillNav from './PillNav';
import { getColumnLeaders, nextSort, sortPlayers } from '../utils/gameDetail';
import { formatGameTime, formatPeriod, STATUS_FINAL, STATUS_LIVE, STATUS_SCHEDULED } from '../utils/liveGames';

export function GameMatchup({ game, scoreChanges }) {
  const status = Number(game.status);
  const isLive = status === STATUS_LIVE;
  const isFinal = status === STATUS_FINAL;
  const isFuture = status === STATUS_SCHEDULED;
  // Today's games already carry the time in statusText ("10/5 - 7:00 PM EDT"); upcoming ones only the date.
  const statusHasTime = /\d{1,2}:\d{2}/.test(game.statusText || '');
  const tipoffTime = isFuture && !statusHasTime ? formatGameTime(game.gameTime) : '';

  return (
    <>
      <div className={`status-badge ${isLive ? 'badge-live' : isFinal ? 'badge-final' : 'badge-upcoming'}`}>
        {isLive && <span className="pulse-dot" />}
        {isLive ? `${formatPeriod(game.period)} · ${game.gameClock || ''}` : game.statusText}
        {tipoffTime && <span className="game-tipoff-time"> · {tipoffTime}</span>}
      </div>
      <div className="matchup">
        {['away', 'home'].map((side, index) => {
          const team = game[side];
          const opponent = game[side === 'away' ? 'home' : 'away'];
          // A changed score gets a new key so the element remounts and replays its pop animation.
          const popped = Boolean(scoreChanges?.[side]);
          return (
            <div key={side} className="matchup-team-wrap">
              <div className={`team-block ${!isFuture && team.score > opponent.score ? 'winning' : ''}`}>
                {team.logo ? (
                  <img src={team.logo} alt={team.tricode} className="team-logo" />
                ) : (
                  <div className="team-logo-placeholder">{team.tricode}</div>
                )}
                <span className="team-tricode">{team.tricode}</span>
                {team.record && <span className="team-record">{team.record}</span>}
                <span data-numeric className={`team-score ${isFuture ? 'score-future' : ''}`}
                  key={popped ? `${side}-${team.score}` : side} data-score-pop={popped ? '' : undefined}>
                  {isFuture ? '–' : team.score}
                </span>
              </div>
              {index === 0 && (
                <div className="vs-divider">
                  {isFuture ? <span className="vs-text">VS</span> : <span className="vs-dash">—</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {game.arena && <div className="arena-label">{game.arena}</div>}
    </>
  );
}

export function QuarterTable({ home, away }) {
  const maxQ = Math.max(home.quarters?.length || 0, away.quarters?.length || 0, 4);
  const labels = Array.from({ length: maxQ }, (_, index) => index < 4 ? `Q${index + 1}` : `OT${index - 3}`);
  const score = (quarters, quarter) => quarters?.find(item => item.q === quarter + 1)?.score ?? '-';

  return (
    <div className="quarter-table-wrap">
      <table className="quarter-table">
        <thead>
          <tr><th>Team</th>{labels.map(label => <th key={label}>{label}</th>)}<th>T</th></tr>
        </thead>
        <tbody>
          {[away, home].map(team => (
            <tr key={team.tricode}>
              <td className="team-cell">
                {team.logo && <img src={team.logo} alt={team.tricode} className="q-logo" />}
                <span>{team.tricode}</span>
              </td>
              {labels.map((_, index) => <td key={index}>{score(team.quarters, index)}</td>)}
              <td className="total-cell">{team.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerRow({ player, onClick, isFuture, leaders = {}, index = 0 }) {
  // The best value in each column for this team gets a marker.
  const lead = key => (!isFuture && leaders[key] !== null && leaders[key] !== undefined && Number(player[key]) === leaders[key] ? 'is-leader' : '');
  return (
    <tr className={`player-row bs-row ${player.oncourt ? 'oncourt' : ''}`} onClick={() => onClick(player)}
      style={{ '--i': Math.min(index, 12) }}>
      <td className="player-name-cell">
        {player.oncourt && <span className="live-dot" />}
        <span className="pname">{player.name}</span>
        <span className="ppos">{player.position}</span>
      </td>
      <td>{isFuture ? '–' : player.min}</td>
      <td className={`stat-highlight ${lead('pts')}`}>{player.pts}</td>
      <td className={lead('reb')}>{player.reb}</td><td className={lead('ast')}>{player.ast}</td>
      <td className={lead('stl')}>{player.stl}</td><td className={lead('blk')}>{player.blk}</td>
      {isFuture ? (
        <>
          <td className="season-stat">{player.season_ppg ?? '–'}</td>
          <td className="season-stat">{player.season_rpg ?? '–'}</td>
          <td className="season-stat">{player.season_apg ?? '–'}</td>
        </>
      ) : (
        <>
          <td>{player.fgm}/{player.fga}</td><td>{player.fg3m}/{player.fg3a}</td><td>{player.ftm}/{player.fta}</td>
          <td className={player.plusMinus > 0 ? 'plus' : player.plusMinus < 0 ? 'minus' : ''}>
            {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}
          </td>
        </>
      )}
    </tr>
  );
}

const STAT_COLUMNS = [['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']];
const GAME_COLUMNS = [['fg', 'FG'], ['fg3', '3P'], ['ft', 'FT'], ['plusMinus', '+/-']];
const SEASON_COLUMNS = [['season_ppg', 'S·PPG'], ['season_rpg', 'S·RPG'], ['season_apg', 'S·APG']];

export function BoxScore({ game, onPlayerClick }) {
  const [tab, setTab] = useState('home');
  const [sort, setSort] = useState(null);
  const isFuture = Number(game.status) === STATUS_SCHEDULED;
  const players = game.players?.[tab] || [];
  const starters = players.slice(0, 5);
  const bench = players.slice(5);
  const sorted = sortPlayers(players, sort);
  const leaders = getColumnLeaders(players);
  const columns = [...STAT_COLUMNS, ...(isFuture ? SEASON_COLUMNS : GAME_COLUMNS)];

  useEffect(() => {
    setTab('home');
    setSort(null);
  }, [game.gameId]);

  const header = ([key, label]) => {
    const active = sort?.key === key;
    return (
      <th key={key} className={key.startsWith('season_') ? 'season-header' : undefined}
        aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}>
        <button type="button" className="sort-btn" data-active={active ? '' : undefined}
          onClick={() => setSort(current => nextSort(current, key))}>
          {label}
          <span className="sort-arrow" aria-hidden="true">{active ? (sort.dir === 'desc' ? '▼' : '▲') : '↕'}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="boxscore">
      <PillNav className="bs-tabs" tabClassName="bs-tab" label="Box score team" idPrefix="bs" panelId="bs-panel"
        value={tab} onChange={setTab}
        items={['away', 'home'].map(side => ({
          id: side,
          label: <>{game[side].logo && <img src={game[side].logo} alt="" className="tab-logo" />}{game[side].city} {game[side].name}</>,
        }))} />
      {isFuture && <div className="future-note">Season averages shown &nbsp;·&nbsp; Game stats update at tip-off</div>}
      <div className="player-table-wrap" id="bs-panel" role="tabpanel" aria-labelledby={`bs-tab-${tab}`}>
        <table className="player-table">
          <thead>
            <tr>
              <th>Player</th>
              {columns.map(header)}
            </tr>
          </thead>
          {/* Keyed by team and sort so switching either remounts the rows and replays their staggered
              entrance; a background refresh keeps the key, so rows don't re-animate every 30 seconds. */}
          <tbody key={`${tab}:${sort ? `${sort.key}-${sort.dir}` : 'default'}`}>
            {!sort && starters.length > 0 && <tr className="group-header"><td colSpan={12}>{isFuture ? 'Roster (by PPG)' : 'Starters'}</td></tr>}
            {sort ? (
              // Sorted: one ranked list, since splitting a ranking into starters and bench would mislead.
              sorted.map((player, index) => <PlayerRow key={player.personId || player.name} player={player} onClick={onPlayerClick} isFuture={isFuture} leaders={leaders} index={index} />)
            ) : (
              <>
                {starters.map((player, index) => <PlayerRow key={player.personId || player.name} player={player} onClick={onPlayerClick} isFuture={isFuture} leaders={leaders} index={index} />)}
                {bench.length > 0 && <tr className="group-header"><td colSpan={12}>Bench</td></tr>}
                {bench.map((player, index) => <PlayerRow key={player.personId || player.name} player={player} onClick={onPlayerClick} isFuture={isFuture} leaders={leaders} index={index + 5} />)}
              </>
            )}
            {players.length === 0 && <tr><td colSpan={12} className="no-data">No player data available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
