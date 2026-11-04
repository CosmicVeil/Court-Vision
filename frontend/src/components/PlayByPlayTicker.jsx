import { useEffect, useRef, useState } from 'react';
import { teamDotColor } from '../utils/teamColors';

/**
 * Play-by-play ticker — a scrolling feed of the latest game actions.
 * Newest plays sit at the top. Key events (made 3PT, dunk, steal, block) get a
 * coloured accent. When a new key event arrives during a live game, a floating
 * "what just happened" banner pops in and auto-dismisses after 4 seconds.
 *
 * Props:
 *   plays   — array from /playbyplay (chronological; this component reverses it)
 *   isLive  — whether to surface the live banner for new key events
 */

const CATEGORY_LABELS = {
  three: '3-POINTER',
  dunk: 'DUNK',
  steal: 'STEAL',
  block: 'BLOCK',
};

const BANNER_MS = 4000;
// Only these categories are "key events" worth highlighting / bannering.
const KEY_CATEGORIES = new Set(['three', 'dunk', 'steal', 'block']);

export default function PlayByPlayTicker({ plays = [], isLive = false }) {
  const [banner, setBanner] = useState(null);
  const lastSeenIdRef = useRef(null);
  const bannerTimerRef = useRef(null);
  const initialisedRef = useRef(false);

  // Newest first for display.
  const ordered = [...plays].reverse();

  // Detect newly-arrived key events and raise the banner (live games only).
  useEffect(() => {
    if (!plays.length) return;
    const newestId = plays[plays.length - 1].id;

    // First load: record position without firing a banner for historical plays.
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      lastSeenIdRef.current = newestId;
      return;
    }
    if (newestId === lastSeenIdRef.current) return;

    if (isLive) {
      // Find the newest key event among plays added since we last looked.
      const lastSeenIndex = plays.findIndex(play => play.id === lastSeenIdRef.current);
      const fresh = lastSeenIndex >= 0 ? plays.slice(lastSeenIndex + 1) : plays;
      const keyEvent = [...fresh].reverse().find(play => KEY_CATEGORIES.has(play.category));
      if (keyEvent) {
        setBanner(keyEvent);
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setBanner(null), BANNER_MS);
      }
    }
    lastSeenIdRef.current = newestId;
  }, [plays, isLive]);

  useEffect(() => () => clearTimeout(bannerTimerRef.current), []);

  if (!plays.length) {
    return <div className="pbp-empty">No play-by-play available for this game yet.</div>;
  }

  return (
    <div className="pbp">
      {banner && (
        <div className={`pbp-banner cat-${banner.category}`} role="status">
          <span className="pbp-banner-tag">{CATEGORY_LABELS[banner.category] || 'PLAY'}</span>
          <span className="pbp-banner-text">{banner.text}</span>
        </div>
      )}

      <ol className="pbp-feed">
        {ordered.map(play => {
          const isKey = KEY_CATEGORIES.has(play.category);
          const accent = play.team ? teamDotColor(play.team) : undefined;
          return (
            <li key={play.id} className={`pbp-row cat-${play.category} ${isKey ? 'is-key' : ''}`}
              style={accent ? { '--team-accent': accent } : undefined}>
              <span className="pbp-clock" data-numeric>
                <span className="pbp-period">{play.periodLabel ? shortPeriod(play.periodLabel, play.period) : ''}</span>
                {play.clock}
              </span>
              {play.team && <span className="pbp-team" style={{ color: accent }}>{play.team}</span>}
              <span className="pbp-text">{play.text}</span>
              {isKey && <span className="pbp-chip">{CATEGORY_LABELS[play.category]}</span>}
              {(play.scoring || play.shooting) && (
                <span className="pbp-score" data-numeric>{play.awayScore}–{play.homeScore}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// "1st Quarter" -> "Q1", "Overtime" -> "OT".
function shortPeriod(label, number) {
  if (number >= 5) return `OT${number - 4 > 1 ? number - 4 : ''}`;
  if (number >= 1 && number <= 4) return `Q${number}`;
  return label.slice(0, 3).toUpperCase();
}
