import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { Children, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import { readFrontend } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { default: GameScoreboard } = loadFrontendModule('src/components/GameScoreboard.jsx');
const game = {
  status: 3, statusText: 'Final',
  away: { city: 'Boston', name: 'Celtics', tricode: 'BOS', score: 112, logo: '/bos.png' },
  home: { city: 'Los Angeles', name: 'Lakers', tricode: 'LAL', score: 123, logo: '/lal.png' },
};
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
});

test('both scoreboard logos render named links to the correct team routes in every game state', () => {
  for (const status of [1, 2, 3]) {
    const html = renderComponent(GameScoreboard, { game: { ...game, status } });
    const links = [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/g)]
      .filter(match => match[1].includes('scoreboard-team-link'));
    assert.equal(links.length, 2);
    for (const [index, side] of ['away', 'home'].entries()) {
      const team = game[side];
      assert.ok(links[index][1].includes(`href="/teams/${team.tricode}"`));
      assert.ok(links[index][1].includes(`aria-label="${team.city} ${team.name} roster and season"`));
      assert.ok(links[index][2].includes(`src="${team.logo}"`));
      assert.match(links[index][2], /<img[^>]*alt=""/);
    }
  }
});

test('missing logos keep linked tricode placeholders and normalize the team path', () => {
  const html = renderComponent(GameScoreboard, {
    game: { ...game, away: { ...game.away, logo: null, tricode: ' bos ' }, home: { ...game.home, logo: '' } },
  });
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /<a[^>]*aria-label="Boston Celtics roster and season"[^>]*href="\/teams\/BOS"[^>]*><span class="team-logo-placeholder"> bos <\/span><\/a>/);
  assert.match(html, /<a[^>]*href="\/teams\/LAL"[^>]*><span class="team-logo-placeholder">LAL<\/span><\/a>/);
});

test('team links have no hidden ancestors while duplicate names and scores remain aria-hidden', () => {
  for (const status of [1, 2, 3]) {
    let links = 0;
    let hiddenText = 0;
    // This component has no hooks. Inspect its actual React tree to check every ancestor,
    // including wrappers that would be easy to miss with source or HTML substring assertions.
    function visit(node, ancestors = []) {
      if (!isValidElement(node)) return;
      const { props } = node;
      if (props.className === 'scoreboard-team-link') {
        links += 1;
        assert.equal(node.type, Link);
        for (const ancestor of [...ancestors, node]) {
          assert.ok(![true, 'true'].includes(ancestor.props['aria-hidden']));
          assert.ok(!ancestor.props.hidden);
          assert.ok(!ancestor.props.inert);
        }
        assert.notEqual(props.tabIndex, -1);
      }
      if (['scoreboard-name', 'scoreboard-score'].includes(props.className)) {
        hiddenText += 1;
        assert.ok([true, 'true'].includes(props['aria-hidden']));
      }
      Children.forEach(props.children, child => visit(child, [...ancestors, node]));
    }
    visit(GameScoreboard({ game: { ...game, status }, scoreChanges: { home: true } }));
    assert.equal(links, 2);
    assert.equal(hiddenText, 4);
  }
});

test('scoreboard logo links have visible keyboard focus and respect reduced motion', () => {
  const css = readFrontend('src/pages/LiveGames.css');
  assert.match(css, /\.scoreboard-team-link:focus-visible\s*\{[^}]*outline:\s*2px solid[^}]*outline-offset:\s*4px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.scoreboard-team-link\s*\{\s*transition:\s*none/);
  assert.match(css, /\.scoreboard-team-link:hover,\s*\.scoreboard-team-link:active\s*\{\s*transform:\s*none/);
});
