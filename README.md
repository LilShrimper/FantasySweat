# Fantasy Sweat

A Chrome extension that pulls your Sleeper and ESPN fantasy football matchups and tells you who to cheer for and who to root against, game by game, with live scores, win chances and play-by-play.

**[Get Fantasy Sweat on the Chrome Web Store](https://chromewebstore.google.com/detail/fantasy-sweat/bhaohbflgbbolomcgkapoabjkocmbpbc)**

## Features

- **League cards**: your score vs your opponent's in every league, with projected totals, win % (Sleeper's own formula, including in-game projections), records and standings. Click a card to show only that league; Shift+click (or Ctrl+click) to pick several.
- **By game / By player / By NFL team**: every starter sorted into *cheer for* or *root against*. Players you start in one league who face you in another are marked "Coin flip".
- **Live plays**: the latest fantasy-scoring plays for you and against you from games in progress, with each play's points under each league's scoring.
- **Filters**: by kickoff window (e.g. Sun 1:00 PM), live now, or still to play.
- **Must-watch**: the unfinished game with the most projected fantasy points riding on it.
- **Live updates**: refreshes every 30 seconds while games are on.
- **Popout and full tab**: keep it open in its own window or a browser tab; the popout's **Back to tab** button jumps back to your full tab.
- **Settings**: Sleeper username and ESPN leagues; show or hide each league; a short tag and color per league; and nicknames for any fantasy team, shown on the league cards.

## Install

1. Open **[Fantasy Sweat on the Chrome Web Store](https://chromewebstore.google.com/detail/fantasy-sweat/bhaohbflgbbolomcgkapoabjkocmbpbc)** and click **Add to Chrome**.
2. Pin it: click the puzzle-piece icon in Chrome's toolbar, then the pin next to **Fantasy Sweat**.
3. Open it and enter your **Sleeper username**, add an **ESPN league**, or both.

**Adding an ESPN league:** open the league on ESPN's website and copy the number after `leagueId=` in the address bar, paste it into Settings, then pick your team. Only leagues set to be viewable by the public work for now.

Chrome keeps the extension up to date on its own.

## Data sources

All public, no login needed:

| Data | Source |
|---|---|
| Leagues, rosters, matchups, live points | Sleeper API (`api.sleeper.app`) |
| Projections, season stats, schedule, player list | `api.sleeper.com` |
| Play-by-play with per-player stats | Sleeper Game Center feed (`sleeper.com/graphql`) |
| ESPN leagues: matchups, lineups, projections, win probability | ESPN Fantasy API (`lm-api-reads.fantasy.espn.com`) |
| NFL schedule, live scores, game clock, team records, TV networks | ESPN scoreboard (`site.api.espn.com`) |

The Sleeper Game Center feed and ESPN's APIs are unofficial and can change without notice.

## Privacy

Your settings stay in your browser, and the extension only talks to Sleeper and ESPN. No accounts, tracking or ads. Full details: [privacy policy](PRIVACY.md).

## Support

Found a bug or have an idea? [Open an issue](https://github.com/LilShrimper/FantasySweat/issues).

## Project layout

```
manifest.json        Chrome extension manifest (MV3)
fantasy-sweat.html   Page structure (popup, popout window and full tab all use it)
popup.css            Styles (dark and light themes)
popup.js             Data loading, cheer/boo logic, win %, live plays, rendering
icons/               Toolbar and store icons
```
