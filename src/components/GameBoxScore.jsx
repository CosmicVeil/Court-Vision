import { useEffect, useState } from 'react';
import { formatGameTime, STATUS_FINAL, STATUS_LIVE, STATUS_SCHEDULED } from '../utils/liveGames';

export function GameMatchup({ game }) {
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
        {isLive ? `Q${game.period} · ${game.gameClock || ''}` : game.statusText}
        {tipoffTime && <span className="game-tipoff-time"> · {tipoffTime}</span>}
      </div>
      <div className="matchup">
        {['away', 'home'].map((side, index) => {
          const team = game[side];
          const opponent = game[side === 'away' ? 'home' : 'away'];
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
                <span className={`team-score ${isFuture ? 'score-future' : ''}`}>
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

function PlayerRow({ player, onClick, isFuture }) {
  return (
    <tr className={`player-row ${player.oncourt ? 'oncourt' : ''}`} onClick={() => onClick(player)}>
      <td className="player-name-cell">
        {player.oncourt && <span className="live-dot" />}
        <span className="pname">{player.name}</span>
        <span className="ppos">{player.position}</span>
      </td>
      <td>{isFuture ? '–' : player.min}</td>
      <td className="stat-highlight">{player.pts}</td>
      <td>{player.reb}</td><td>{player.ast}</td><td>{player.stl}</td><td>{player.blk}</td>
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

export function BoxScore({ game, onPlayerClick }) {
  const [tab, setTab] = useState('home');
  const isFuture = Number(game.status) === STATUS_SCHEDULED;
  const players = game.players?.[tab] || [];
  const starters = players.slice(0, 5);
  const bench = players.slice(5);

  useEffect(() => setTab('home'), [game.gameId]);

  return (
    <div className="boxscore">
      <div className="bs-tabs">
        {['away', 'home'].map(side => (
          <button key={side} className={`bs-tab ${tab === side ? 'active' : ''}`} onClick={() => setTab(side)}>
            {game[side].logo && <img src={game[side].logo} alt="" className="tab-logo" />}
            {game[side].city} {game[side].name}
          </button>
        ))}
      </div>
      {isFuture && <div className="future-note">Season averages shown &nbsp;·&nbsp; Game stats update at tip-off</div>}
      <div className="player-table-wrap">
        <table className="player-table">
          <thead>
            <tr>
              <th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th>
              {isFuture ? (
                <><th className="season-header">S·PPG</th><th className="season-header">S·RPG</th><th className="season-header">S·APG</th></>
              ) : (
                <><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {starters.length > 0 && <tr className="group-header"><td colSpan={12}>{isFuture ? 'Roster (by PPG)' : 'Starters'}</td></tr>}
            {starters.map(player => <PlayerRow key={player.personId || player.name} player={player} onClick={onPlayerClick} isFuture={isFuture} />)}
            {bench.length > 0 && <tr className="group-header"><td colSpan={12}>Bench</td></tr>}
            {bench.map(player => <PlayerRow key={player.personId || player.name} player={player} onClick={onPlayerClick} isFuture={isFuture} />)}
            {players.length === 0 && <tr><td colSpan={12} className="no-data">No player data available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
