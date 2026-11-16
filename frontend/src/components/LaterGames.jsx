import { TeamLogo } from './GameMatchup';
import { getLaterGameLine, todayInEastern } from '../utils/gamePredictions';
import './LaterGames.css';

// A player's later predicted games, one muted line each, under his nearest game (the card's
// full stats, or the popup's grid). Kept small on purpose: the nearest game is the one to read,
// and later ones are predicted from older form, so they are less reliable.
export default function LaterGames({ games, title = 'Later games' }) {
  if (!games?.length) return null;
  const today = todayInEastern();
  return (
    <div className="later-games">
      <p className="later-games-title">{title}</p>
      <ul className="later-games-list">
        {games.map(game => {
          const line = getLaterGameLine(game, today);
          return (
            <li key={game.game_id} className="later-game" data-numeric>
              <span className="later-game-day">{line.day}</span>
              <span className="later-game-opp">
                <span className="gm-joiner">{game.is_home ? 'vs' : '@'}</span>
                <span className="later-game-logo" aria-hidden="true">
                  <TeamLogo tricode={game.opponent} logo={game.opponent_logo} />
                </span>
                {game.opponent}
              </span>
              <span className="later-game-stats">
                {line.stats.map(stat => (
                  <span key={stat.key}>{stat.value} <small>{stat.label}</small></span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
