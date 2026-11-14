# Team

`/teams/:tricode`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Teams/desktop/TOR-roster.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Teams/mobile/TOR-roster.png`
- [Toronto game log · desktop](existing/games-desktop.png) · `Screenshots/Teams/desktop/TOR-games.png`
- [Toronto game log · mobile](existing/games-mobile.png) · `Screenshots/Teams/mobile/TOR-games.png`

## Existing UI brief

- Visible content includes All Teams, team mark, city/name, season, W–L, streak, recent W/L form, Home/Away records, PPG and Opp PPG. A partial archive shows the missing-game count and explains where the record comes from. Team scoring, rebounding and assist leaders show name, portrait/fallback, position, per-game stat/value and player action. The Roster and Games tabs show counts.
- Roster columns include portrait, player name/actions, injury, position, age, GP, PPG, RPG, APG, SPG, BPG, FG%, 3P%, FT%, FPTS and scoring tooltip. The archive covers all 30 teams.
- Game rows include date, postseason/play-in tag when present, vs/@, opponent logo/name/code and team link, W/L, score, running record when complete, and game detail action. Existing states or controls include partial archive, fully missing archive, unavailable games, no games yet, empty roster, unknown team, loading and API error.

## Frontend entry points

- Page and styles · [Team.jsx](../../../frontend/src/pages/Team.jsx) · [Team.css](../../../frontend/src/pages/Team.css)
- Shared components · [PillNav.jsx](../../../frontend/src/components/PillNav.jsx) · [PlayerHeadshot.jsx](../../../frontend/src/components/PlayerHeadshot.jsx) · [InjuryBadge.jsx](../../../frontend/src/components/InjuryBadge.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [team-page.test.mjs](../../../frontend/tests/team-page.test.mjs) · [injury-status.test.mjs](../../../frontend/tests/injury-status.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P05-`. See [Team in the mockup checklist](../mockup-checklist.md#p05--team) for the planned redesign frames.
