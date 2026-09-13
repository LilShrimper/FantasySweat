# Changelog

What changed in each version of Fantasy Sweat on the Chrome Web Store, newest first. Every version also has a [GitHub Release](https://github.com/LilShrimper/FantasySweat/releases) listing the pull requests that went into it.

When the version in `manifest.json` goes up, rename **Unreleased** to that version and date in the same pull request; the publish workflow copies that section into the version's GitHub Release.

## Unreleased

### New
- **Version in Settings:** the bottom of Settings shows the version you're running (e.g. "Fantasy Sweat v1.0.4"), with a **What's new** link to the Releases page.
- **Closest matchups first:** a Settings option (Display) orders the league cards by how close each matchup is, with win chance nearest 50/50 at the top.
- **Update now:** Fantasy Sweat checks the Chrome Web Store for a newer version (when it opens, at most every 3 hours, and whenever Settings opens). If there is one, a bar offers **Update now** instead of waiting for Chrome to update it on its own.

### Changed
- **Live dot:** the dot by a player's points now shows only while his unit is on the field. It's green normally and red, fading in and out, in the red zone: his offense inside the other team's 20, or his D/ST defending its own. The live marker on game cards is solid red instead of flashing. (#24)
- **By player:** a Sort switch orders the lists by **Points** (as before) or by **Position**, meaning QB, RB, WR, TE, K, D/ST with highest points first within each. The choice is remembered. (#25)
- **Switching tabs** refreshes the scores, at most once every 10 seconds, so a tab you come back to isn't behind what Live plays showed. (#26)
- **Leaving Settings:** click the Fantasy Sweat logo (or ⚙ again) to go back to the main view. If you changed anything, it asks before throwing the changes away.

## 1.0.4 — 2026-09-13

### New
- **Roster panel:** click your team's or your opponent's name on a league card to see the full roster, including starters by slot, the bench with its point total, and IR/taxi, with each player's game, points and projection. (#19)
- **Latest scoring play:** player rows show the points from each player's most recent scoring play beside his total (e.g. "8.3 +7.4"), green when it helped you and red when it hurt. Hover for the play. (#21)
- **Bench tab:** your benched players in each league, with the bench's total points and projection. (#22)

### Changed
- Play-by-play is pulled on every refresh again, whatever tab is open, since every tab now uses it. (#21)
- All five tabs fit on one line in the popup. (#22)

## 1.0.3 — 2026-09-12

No changes to the extension itself; this was the first version uploaded by the automatic publish workflow.

_There is no 1.0.2. It was skipped by accident: the last version number was forgotten when this one was picked, and nothing was ever released as 1.0.2._

- README rewritten for installing from the Chrome Web Store. (#17)
- Publish workflow moved to `actions/checkout` and `actions/setup-node` v5. (#16)

## 1.0.1 — 2026-09-12

### New
- **League colors:** click a league's tag in Settings to pick its color, and ↺ to go back to the default. (#12)

### Changed
- The full tab opens at `…/fantasy-sweat.html` instead of `…/popup.html?full=1`, so old bookmarks to the old address stop working. (#11)
- "Both sides" is now **Coin flip**: a player you start in one league who's started against you in another. (#13)
- Points and projections show hundredths when they aren't 0 (e.g. 129.89 vs 134.02), matching Sleeper. (#14)

## 1.0.0 — 2026-09-11

First version submitted to the Chrome Web Store (uploaded by hand).

### Features
- **Sleeper and ESPN leagues:** Sleeper by username, and public ESPN leagues by league ID.
- **League cards:** your score vs your opponent's, projections, win % (Sleeper's formula, ESPN's for ESPN leagues), records and standings. Click a card to show only that league, and Shift+click to pick several.
- **By game, By player and By NFL team:** every starter sorted into Cheer for or Root against, with players on both sides of your matchups called out.
- **Live plays:** the latest fantasy-scoring plays for and against you from games in progress.
- **Filters and must-watch:** filter by kickoff window, live now or still to play, plus the unfinished game with the most points riding on it.
- **Live updates:** refreshes every 30 seconds during games, and you can pop out to its own window or open a full tab.
- **Settings:** show or hide leagues, a short tag per league, and nicknames for any fantasy team.

### Included before release
- Cheer / root-against lists sorted by points, or projection before kickoff. (#4)
- NFL team ties shown only when a team has one. (#5)
- The TV network next to each kickoff time. (#6)
- Show/hide leagues and team nicknames in Settings. (#7)
- **Code review fixes (#8):**
  - saved plays can no longer fill Chrome's storage
  - a popout left open follows the new NFL week
  - overlapping refreshes can't show the wrong week
  - Settings isn't covered by auto-refresh
  - smaller Settings and ESPN playoff fixes
- **Back to tab** in the popout returns to the full tab instead of opening another one. (#9)
