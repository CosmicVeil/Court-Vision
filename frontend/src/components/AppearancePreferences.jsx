import { useEffect, useState } from 'react';
import { saveTheme } from '../utils/theme';

export default function AppearancePreferences() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    const update = () => setTheme(document.documentElement.dataset.theme);
    window.addEventListener('themechange', update);
    return () => window.removeEventListener('themechange', update);
  }, []);

  return (
    <section className="profile-card appearance-preferences" aria-labelledby="appearance-title">
      <p className="profile-eyebrow">User preferences</p>
      <h2 id="appearance-title">Appearance</h2>
      <p className="profile-note" id="appearance-note">Choose how CourtVision looks. Saved automatically in this browser.</p>
      <fieldset className="appearance-options" aria-describedby="appearance-note">
        <legend className="visually-hidden">Color theme</legend>
        {['light', 'dark'].map(mode => (
          <label key={mode} className={`appearance-option ${theme === mode ? 'selected' : ''}`}>
            <input type="radio" name="appearance" value={mode} checked={theme === mode} onChange={() => saveTheme(mode)} />
            <span className={`appearance-preview appearance-preview--${mode}`} aria-hidden="true"><span /><i /><i /></span>
            <span>{mode === 'light' ? 'Light' : 'Dark'}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
