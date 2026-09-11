# Fantasy Sweat

A Chrome extension that pulls your Sleeper fantasy football matchups and tells you who to cheer for and who to root against, game by game, with live scores, win chances and play-by-play.

## Features

- **League cards**: your score vs your opponent's in every league, with projected totals, win % (Sleeper's own formula, including in-game projections), records and standings. Click a card to show only that league; Shift+click (or Ctrl+click) to pick several.
- **By game / By player / By NFL team**: every starter sorted into *cheer for* or *root against*. Players you start in one league who face you in another are marked "Both sides".
- **Live plays**: the latest fantasy-scoring plays for you and against you from games in progress, with each play's points under each league's scoring.
- **Filters**: by kickoff window (e.g. Sun 1:00 PM), live now, or still to play.
- **Must-watch**: the unfinished game with the most projected fantasy points riding on it.
- **Live updates**: refreshes every 30 seconds while games are on. Popout window and full-tab views.
- **Settings**: Sleeper username and a nickname for each league's tag.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Pin **Fantasy Sweat**, open it, and enter your Sleeper username.

After changing any file, click ↻ on the extension's card in `chrome://extensions`.

## Data sources

All public, no login needed:

| Data | Source |
|---|---|
| Leagues, rosters, matchups, live points | Sleeper API (`api.sleeper.app`) |
| Projections, season stats, schedule, player list | `api.sleeper.com` |
| Play-by-play with per-player stats | Sleeper Game Center feed (`sleeper.com/graphql`) |
| NFL schedule, live scores, game clock, team records | ESPN scoreboard (`site.api.espn.com`) |

The Sleeper Game Center feed and the ESPN scoreboard are unofficial and can change without notice.

## Project layout

```
manifest.json   Chrome extension manifest (MV3)
popup.html      Page structure (popup, popout window and full tab all use it)
popup.css       Styles (dark and light themes)
popup.js        Data loading, cheer/boo logic, win %, live plays, rendering
icons/          Toolbar and store icons
```

## Sharing

Zip this folder (excluding `.git`) and have the other person load it unpacked, as described in **Install**.
