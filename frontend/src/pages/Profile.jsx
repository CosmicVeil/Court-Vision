import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';
import { buildApiUrl } from '../config/api';
import { clearAuth, getUser, isAuthenticated, setScoring } from '../utils/auth';
import { SCORING_STATS, scoringFormula } from '../utils/fantasy';
import { enterDelay } from '../utils/scrollReveal';
import './Profile.css';

// Account settings. Today that is fantasy scoring: a platform preset or custom points per stat,
// saved to the account (PUT /api/profile/scoring) and mirrored onto the stored user, which is
// where main.jsx reads it to send with every API request.
function Profile() {
  // State, not a per-render read: a 401 below signs the visitor out and must re-render the page.
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  const [expired, setExpired] = useState(false);
  const user = getUser();
  const [presets, setPresets] = useState([]);
  const [choice, setChoice] = useState('fanduel');
  const [weights, setWeights] = useState({});
  const [status, setStatus] = useState({ kind: 'loading', message: '' });

  // isAuthenticated() only sees a token in localStorage, not whether the server still accepts it
  // (tokens expire after 24 hours). On 401, drop the stale token and show the sign-in prompt.
  const endSession = () => {
    clearAuth();
    setExpired(true);
    setSignedIn(false);
  };

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(buildApiUrl('profile/scoring'), { signal: controller.signal });
        if (response.status === 401) return endSession();
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = await response.json();
        setPresets(data.presets || []);
        setChoice(data.scoring.preset);
        setWeights(data.scoring.weights);
        setScoring(data.scoring);
        setStatus({ kind: 'idle', message: '' });
      } catch (err) {
        if (err.name !== 'AbortError') setStatus({ kind: 'error', message: 'Could not load your settings.' });
      }
    })();
    return () => controller.abort();
  }, [signedIn]);

  const choosePreset = (preset) => {
    setChoice(preset.id);
    setWeights(preset.weights);
    setStatus({ kind: 'idle', message: '' });
  };

  // Custom starts from whatever is selected, so "ESPN but points are worth 2" is one edit.
  const chooseCustom = () => {
    setChoice('custom');
    setStatus({ kind: 'idle', message: '' });
  };

  const setWeight = (key, value) => {
    setChoice('custom');
    setWeights(current => ({ ...current, [key]: value }));
    setStatus({ kind: 'idle', message: '' });
  };

  const invalid = choice === 'custom'
    && SCORING_STATS.some(({ key }) => weights[key] === '' || !Number.isFinite(Number(weights[key])));

  const save = async () => {
    setStatus({ kind: 'saving', message: 'Saving…' });
    const body = choice === 'custom'
      ? { preset: 'custom', weights: Object.fromEntries(SCORING_STATS.map(({ key }) => [key, Number(weights[key])])) }
      : { preset: choice };
    try {
      const response = await fetch(buildApiUrl('profile/scoring'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 401) return endSession();
      // A proxy error page (HTML 502) is not JSON; fall back to the generic message below.
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not save your settings.');
      setScoring(data.scoring);
      setWeights(data.scoring.weights);
      setStatus({ kind: 'saved', message: `Saved. Fantasy points now use ${data.scoring.label} scoring.` });
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not save your settings.' });
    }
  };

  if (!signedIn) {
    return (
      <main className="profile-page">
        <div className="profile-shell">
          <PageHero eyebrow="PROFILE" title="YOUR" accent="PROFILE" lead={expired ? 'Your session expired. Log in again to see your scoring.'
            : 'Sign in to choose how fantasy points are scored.'} />
          <section className="profile-card profile-signin" data-enter style={enterDelay(1)}>
            <p>Your fantasy scoring is saved to your account, so it follows you to every device.</p>
            <Link to="/login" className="profile-button">Log in</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <div className="profile-shell">
        <PageHero
          eyebrow="PROFILE"
          title="YOUR"
          accent="PROFILE"
          lead={user ? `${user.first_name} ${user.last_name} · ${user.email}` : undefined}
        />

        <section className="profile-card" aria-labelledby="profile-scoring-title" data-enter style={enterDelay(1)}>
          <p className="profile-eyebrow">FANTASY</p>
          <h2 id="profile-scoring-title">Scoring</h2>
          <p className="profile-note">
            Used for every fantasy point on the site: game logs, box scores, the Stats rankings and projected
            fantasy points. Only PTS, REB, AST, STL, BLK and TOV are scored, because those are the stats the
            model predicts. Presets marked <em>approx.</em> also score shooting or bonuses on their platform.
          </p>

          {status.kind === 'loading' ? <p className="profile-status">Loading…</p> : presets.length === 0 ? (
            // The saved setting never loaded, so there is nothing safe to edit: saving now would
            // overwrite the account's preset with this form's FanDuel placeholder.
            <p className="profile-status error" role="status">{status.message}</p>
          ) : (
            <>
              <div className="profile-presets" role="radiogroup" aria-label="Scoring preset">
                {presets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={choice === preset.id}
                    className={`profile-preset ${choice === preset.id ? 'active' : ''}`}
                    onClick={() => choosePreset(preset)}
                  >
                    <span className="profile-preset-name">
                      {preset.label}{preset.id === 'fanduel' && ' (default)'}
                      {!preset.exact && <span className="profile-badge">approx.</span>}
                    </span>
                    <span className="profile-preset-formula">{scoringFormula(preset.weights)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === 'custom'}
                  className={`profile-preset ${choice === 'custom' ? 'active' : ''}`}
                  onClick={chooseCustom}
                >
                  <span className="profile-preset-name">Custom</span>
                  <span className="profile-preset-formula">Your league's own points per stat</span>
                </button>
              </div>

              <fieldset className="profile-weights">
                <legend>Points per stat{choice !== 'custom' && ' (edit any to switch to Custom)'}</legend>
                {SCORING_STATS.map(({ key, label }) => (
                  <label key={key} className="profile-weight">
                    <span>{label}</span>
                    <input
                      type="number"
                      step="0.05"
                      min="-100"
                      max="100"
                      value={weights[key] ?? ''}
                      onChange={event => setWeight(key, event.target.value)}
                    />
                  </label>
                ))}
              </fieldset>

              <p className="profile-formula" data-numeric>
                FPTS = {invalid ? '…' : scoringFormula(Object.fromEntries(SCORING_STATS.map(({ key }) => [key, Number(weights[key])])))}
              </p>

              <div className="profile-actions">
                <button type="button" className="profile-button" onClick={save} disabled={invalid || status.kind === 'saving'}>
                  Save scoring
                </button>
                {status.message && (
                  <span className={`profile-status ${status.kind}`} role="status">{status.message}</span>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default Profile;
