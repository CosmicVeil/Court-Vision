import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { injuryDescription, injuryReturnLabel, injurySummary, injuryTone } from '../src/utils/injury.js';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { default: InjuryBadge } = loadFrontendModule('src/components/InjuryBadge.jsx');
const { default: PlayerStatsModal } = loadFrontendModule('src/components/PlayerStatsModal.jsx');
const { Roster } = loadFrontendModule('src/pages/Team.jsx', ['Roster']);
const { buildPlayerFallback } = loadFrontendModule('src/utils/playerDetails.js');

beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
});

const out = {
  status: 'Out', status_abbr: 'OUT', injury: 'Foot', detail: 'Fracture', side: 'Left',
  return_date: '2026-12-12', note: 'Re-evaluated in four weeks.',
};
const dtd = { status: 'Day-To-Day', status_abbr: 'DTD', injury: 'Ankle', detail: '', side: '', return_date: null, note: '' };

test('tone follows the status, case-insensitively', () => {
  assert.equal(injuryTone(out), 'out');
  assert.equal(injuryTone({ status: 'day-to-day' }), 'dtd');
  for (const injury of [{ status: 'Suspension' }, {}, null, undefined]) assert.equal(injuryTone(injury), 'other');
});

test('description joins side, body part and detail, skipping blanks', () => {
  assert.equal(injuryDescription(out), 'Left Foot (Fracture)');
  assert.equal(injuryDescription(dtd), 'Ankle');
  assert.equal(injuryDescription({ detail: 'Illness' }), 'Illness');
  assert.equal(injuryDescription({}), '');
  assert.equal(injuryDescription(null), '');
});

test('return label formats the date and ignores missing or invalid dates', () => {
  assert.equal(injuryReturnLabel(out), 'Expected back Dec 12');
  for (const return_date of [null, '', 'soon']) assert.equal(injuryReturnLabel({ return_date }), '');
  assert.equal(injurySummary(out), 'Out · Left Foot (Fracture) · Expected back Dec 12');
  assert.equal(injurySummary(dtd), 'Day-To-Day · Ankle');
  assert.equal(injurySummary(null), '');
});

test('badge shows the abbreviation with a tone class, and nothing when healthy', () => {
  const html = renderComponent(InjuryBadge, { injury: out });
  assert.match(html, /class="injury-badge injury-badge--out"/);
  assert.match(html, />OUT<\/span>/);
  assert.match(html, /title="Out · Left Foot \(Fracture\) · Expected back Dec 12"/);
  assert.match(renderComponent(InjuryBadge, { injury: { status: 'Suspension' } }), />Suspension<\/span>/);
  for (const injury of [null, undefined, {}, { status: '' }]) assert.equal(renderComponent(InjuryBadge, { injury }), '');
});

const rosterPlayer = (id, name, injury) => ({
  id, name, position: 'G', age: 25, games_played: 10, ppg: 20, rpg: 5, apg: 5, spg: 1, bpg: 1,
  fg_pct: 45, fg3_pct: 35, ft_pct: 80, fpts: 35, injury,
});

test('team roster badges only injured players', () => {
  const html = renderComponent(Roster, { roster: [rosterPlayer(1, 'Hurt Player', dtd), rosterPlayer(2, 'Healthy Player', null)], onSelect: () => {} });
  assert.equal([...html.matchAll(/class="injury-badge /g)].length, 1);
  assert.match(html, /Hurt Player<\/button><span class="injury-badge injury-badge--dtd"[^>]*>DTD<\/span>/);
});

test('player popup shows the status, injury, return date and note', () => {
  const player = { id: 2544, name: 'Test Player', team: 'ATL', position: 'G', age: 25, current_stats: {}, history: {}, injury: out };
  const html = renderComponent(PlayerStatsModal, { player, loading: false, onClose: () => {} });
  assert.match(html, />OUT<\/span>/);
  assert.match(html, /<div class="injury-summary"><strong>Out<\/strong><span>· Left Foot \(Fracture\)<\/span><span>· Expected back Dec 12<\/span><p class="injury-summary-note">Re-evaluated in four weeks\.<\/p><\/div>/);

  const healthy = renderComponent(PlayerStatsModal, { player: { ...player, injury: null }, loading: false, onClose: () => {} });
  assert.doesNotMatch(healthy, /injury-/);
});

test('the roster-to-popup fallback keeps the injury entry', () => {
  assert.equal(buildPlayerFallback({ name: 'A', injury: dtd }).injury, dtd);
  assert.equal(buildPlayerFallback({ name: 'A' }).injury, null);
});
