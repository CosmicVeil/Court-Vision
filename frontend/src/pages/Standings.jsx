import { useState, useEffect, useMemo } from 'react';
import { buildApiUrl } from '../config/api';
import PageHero from '../components/PageHero';
import './Standings.css';

// Teams seeded 1-6 are guaranteed a playoff spot; 7-10 are in the play-in zone.
const PLAYOFF_CUTOFF = 6;

// Columns: key drives sorting; numeric columns sort descending first.
const COLUMNS = [
  { key: 'rank', label: 'Rank', numeric: true, align: 'center' },
  { key: 'team', label: 'Team', numeric: false, align: 'left' },
  { key: 'wins', label: 'W', numeric: true, align: 'center' },
  { key: 'losses', label: 'L', numeric: true, align: 'center' },
  { key: 'pct', label: 'PCT', numeric: true, align: 'center' },
  { key: 'gb', label: 'GB', numeric: true, align: 'center' },
  { key: 'home', label: 'Home', numeric: false, align: 'center' },
  { key: 'away', label: 'Away', numeric: false, align: 'center' },
  { key: 'streak', label: 'Streak', numeric: false, align: 'center' },
  { key: 'l10', label: 'L10', numeric: false, align: 'center' },
];

// "W3" -> +3, "L2" -> -2, so a win streak sorts above a losing one.
const streakValue = (streak) => {
  if (typeof streak !== 'string' || streak.length < 2) return 0;
  const n = parseInt(streak.slice(1), 10) || 0;
  return streak[0].toUpperCase() === 'W' ? n : -n;
};

// "7-3" -> wins (for sorting record columns by wins, then win share).
const recordValue = (record) => {
  if (typeof record !== 'string') return 0;
  const [w, l] = record.split('-').map((x) => parseInt(x, 10) || 0);
  const total = w + l;
  return total ? w + w / total : w;
};

const comparatorFor = (key, numeric) => {
  if (key === 'streak') return (t) => streakValue(t.streak);
  if (key === 'home' || key === 'away' || key === 'l10') return (t) => recordValue(t[key]);
  if (numeric) return (t) => Number(t[key]) || 0;
  return (t) => String(t[key] ?? '').toLowerCase();
};

const formatPct = (pct) => {
  // NBA convention: no leading zero, 3 decimals (.875).
  const value = Number(pct) || 0;
  return value.toFixed(3).replace(/^0/, '');
};

const formatGb = (gb) => (!gb || Number(gb) === 0 ? '—' : Number(gb).toFixed(1));

function ConferenceTable({ title, teams, sort, onSort }) {
  const sorted = useMemo(() => {
    const getValue = comparatorFor(sort.key, COLUMNS.find((c) => c.key === sort.key)?.numeric);
    const copy = [...teams];
    copy.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [teams, sort]);

  // The playoff/play-in divider only makes sense while the table is in seed order.
  const showDivider = sort.key === 'rank' && sort.dir === 'asc';
  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '');

  return (
    <section className="standings-conf">
      <h2 className="standings-conf-title">{title}</h2>
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`sortable align-${col.align} ${sort.key === col.key ? 'active' : ''}`}
                  onClick={() => onSort(col.key, col.numeric)}
                  aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  scope="col"
                >
                  {col.label} <span className="sort-arrow">{arrow(col.key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => {
              const seed = team.rank;
              const zone = seed <= PLAYOFF_CUTOFF ? 'playoff' : seed <= 10 ? 'playin' : 'out';
              const needsDivider = showDivider && index > 0 && sorted[index - 1].rank <= PLAYOFF_CUTOFF && seed > PLAYOFF_CUTOFF;
              return (
                <tr key={team.team_id || team.tricode || index} className={`zone-${zone} ${needsDivider ? 'playoff-cutoff' : ''}`}>
                  <td className="align-center rank-cell">{seed}</td>
                  <td className="align-left team-cell">
                    <img
                      src={team.logo || team.logo_fallback}
                      alt=""
                      className="team-logo"
                      loading="lazy"
                      onError={(e) => {
                        // NBA CDN SVGs sometimes fail; fall back to ESPN's PNG once.
                        if (team.logo_fallback && e.currentTarget.src !== team.logo_fallback) {
                          e.currentTarget.src = team.logo_fallback;
                        } else {
                          e.currentTarget.style.visibility = 'hidden';
                        }
                      }}
                    />
                    <span className="team-name">{team.team}</span>
                    <span className="team-tricode">{team.tricode}</span>
                  </td>
                  <td className="align-center">{team.wins}</td>
                  <td className="align-center">{team.losses}</td>
                  <td className="align-center">{formatPct(team.pct)}</td>
                  <td className="align-center">{formatGb(team.gb)}</td>
                  <td className="align-center">{team.home || '—'}</td>
                  <td className="align-center">{team.away || '—'}</td>
                  <td className={`align-center streak-cell ${streakValue(team.streak) > 0 ? 'positive' : streakValue(team.streak) < 0 ? 'negative' : ''}`}>
                    {team.streak || '—'}
                  </td>
                  <td className="align-center">{team.l10 || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="standings-legend">
        <span className="legend-dot legend-playoff" /> Playoff (1-6)
        <span className="legend-dot legend-playin" /> Play-In (7-10)
      </p>
    </section>
  );
}

const Standings = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Each conference keeps its own sort so sorting one table never reorders the other.
  const [eastSort, setEastSort] = useState({ key: 'rank', dir: 'asc' });
  const [westSort, setWestSort] = useState({ key: 'rank', dir: 'asc' });

  useEffect(() => {
    const controller = new AbortController();
    const fetchStandings = async () => {
      try {
        setLoading(true);
        const response = await fetch(buildApiUrl('standings'), { signal: controller.signal });
        if (!response.ok) throw new Error('Failed to fetch standings');
        const json = await response.json();
        if (controller.signal.aborted) return;
        setData(json);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchStandings();
    return () => controller.abort();
  }, []);

  // Clicking a column toggles direction; a new column starts descending for numbers
  // (best first) and ascending for text/records.
  const makeSortHandler = (setSort) => (key, numeric) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: numeric && key !== 'rank' ? 'desc' : 'asc' };
    });
  };

  const hero = (
    <PageHero
      eyebrow="LEAGUE STANDINGS"
      title="NBA"
      accent="STANDINGS"
      lead="All 30 teams ranked by conference, with playoff and play-in seeding"
      stats={[
        { key: 'teams', label: 'Teams', value: data ? '30' : '—' },
        { key: 'season', label: 'Season', value: data?.season || '—' },
        { key: 'east', label: 'East', value: data ? String(data.east?.length || 0) : '—' },
        { key: 'west', label: 'West', value: data ? String(data.west?.length || 0) : '—' },
      ]}
    />
  );

  if (loading && !data) {
    return (
      <div className="standings-container">
        {hero}
        <div className="standings-loading">Loading standings…</div>
      </div>
    );
  }

  if (error && !data) {
    const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
    return (
      <div className="standings-container">
        {hero}
        <div className="standings-error">
          Error: {error}
          <br />
          Make sure the Flask API server is running on {serverUrl}
        </div>
      </div>
    );
  }

  return (
    <div className="standings-container">
      {hero}
      <div className="standings-grid">
        <ConferenceTable
          title="Eastern Conference"
          teams={data.east || []}
          sort={eastSort}
          onSort={makeSortHandler(setEastSort)}
        />
        <ConferenceTable
          title="Western Conference"
          teams={data.west || []}
          sort={westSort}
          onSort={makeSortHandler(setWestSort)}
        />
      </div>
    </div>
  );
};

export default Standings;
