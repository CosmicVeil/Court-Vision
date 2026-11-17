import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getGameDetailPath } from '../utils/liveGames';
import './GameMatchup.css';

// A team's logo, with its tricode as the alt text and tooltip so the team is still named for
// screen readers and on hover. Falls back to the tricode if there is no logo or it fails to load.
export function TeamLogo({ tricode, logo, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) return <span className={`gm-tricode ${className}`.trim()}>{tricode}</span>;
  return (
    <img src={logo} alt={tricode} title={tricode} className={`gm-logo ${className}`.trim()}
      loading="lazy" onError={() => setFailed(true)} />
  );
}

// "[DEN] @ [NOP]" as logos. From one player's side (team, is_home) when given a prediction row,
// or away @ home when given a slate game. With a gameId it links to that game's page.
export default function GameMatchup({ player, game, size = 'sm', gameId }) {
  const [left, right, joiner] = player
    ? [[player.team, player.team_logo], [player.opponent, player.opponent_logo], player.is_home ? 'vs' : '@']
    : [[game.away, game.away_logo], [game.home, game.home_logo], '@'];
  const content = (
    <>
      <span className="gm-mark" aria-hidden="true"><TeamLogo tricode={left[0]} logo={left[1]} /></span>
      <span className="gm-codes">{left[0]} <span className="gm-joiner">{joiner}</span> {right[0]}</span>
      <span className="gm-mark" aria-hidden="true"><TeamLogo tricode={right[0]} logo={right[1]} /></span>
    </>
  );
  if (gameId) {
    return (
      <Link to={getGameDetailPath(gameId)} className={`gm gm--${size} gm-link`} title="Open game">{content}</Link>
    );
  }
  return <span className={`gm gm--${size}`}>{content}</span>;
}
