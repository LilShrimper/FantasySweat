# Changelog

What changed in each version of Fantasy Sweat on the Chrome Web Store, newest first. Every version also has a [GitHub Release](https://github.com/LilShrimper/FantasySweat/releases) listing the pull requests that went into it.

When the version in `manifest.json` goes up, rename **Unreleased** to that version and date in the same pull request; the publish workflow copies that section into the version's GitHub Release.

## Unreleased

### New
- **Team avatars:** league cards show a small avatar before your team's and your opponent's names: the team's Sleeper or ESPN logo, or its first letter when there isn't one. It's sized to the text, so the cards are no taller. Images only load from Sleeper's and ESPN's own servers; an ESPN logo linked from anywhere else shows the letter instead.
- **NFL logos on game and team cards:** each team in a game card's header, and each card in **By NFL team** (bye weeks included), has its logo before its name. Sized to the text, so the cards are no taller.

### Changed
- **League cards:** the verdict in the top right shows by how much, e.g. **Projected win (+17.9)** or **Projected loss (−5.6)** from the projected totals, and **Won (+12.4)** / **Lost (−3.1)** from the final scores.
- **Still to play** on league cards shows up once the week's first game kicks off (usually Thursday night). Before that, every starter is still to play, so the line was just repeating the lineup.

## 1.0.12 — 2026-09-16

### New
- **Bye week reminder:** a league card warns when any of your starters is on bye that week, e.g. "⚠ 2 starters on bye: J. Williams (WR), W. Reichard (K)", so you can swap them out before kickoff. It goes away once the matchup is final. (#51)

## 1.0.11 — 2026-09-14

### Changed
- **Roster panel:** the reserve section is titled by what's in it: **IR**, **Taxi**, or **IR / Taxi** when a team has both. (#48)

### Fixed
- The header no longer shows "null" after the update time when no games are live (e.g. "updated 10:56 AMnull"). (#49)

## 1.0.10 — 2026-09-13

### Changed
- **Live plays:** click a player on a play to open his points breakdown, same as the other tabs. (#46)

## 1.0.9 — 2026-09-13

### New
- **Points breakdown:** click any player (By game, By player, By NFL team, Bench or the roster panel) to see where his points came from, like receptions, receiving yards and TDs, or sacks and points allowed for a D/ST. There's one section per league he's in, scored with that league's rules, and it stays live while open. Esc or ✕ closes it. (#44)

## 1.0.8 — 2026-09-13

### Changed
- **Faster live scores (Sleeper leagues):** while a player's game is in progress, his points are worked out from Sleeper's live stats and your league's scoring. Sleeper's matchup scores can be a few minutes old, so league card totals, win chance and player points now keep up with Live plays. Players whose game hasn't started or is final still show Sleeper's own number, so final scores match the Sleeper app. If the live stats don't load, everything uses Sleeper's number as before. Hover a score to see where it came from. (#42)

## 1.0.7 — 2026-09-13

### New
- **League nicknames as card titles:** a Settings option (Display) titles each league card with the nickname you gave that league instead of its full name. Leagues without a nickname keep their name, and hovering a nickname shows the real one. Settings now calls a league's short tag its **nickname**. (#40)

### Changed
- **Update now** checks for a new version every 30 minutes instead of every 3 hours, so a release shows up much sooner. Opening Settings still checks right away. (#38)
- **Latest scoring play:** the "+7.4" beside a player's points goes away once his game is final. (#39)

## 1.0.6 — 2026-09-13

### New
- **Still to play:** under the win bar on each league card, the starters still to play for you and your opponent, by position (e.g. "2 RB, 1 WR, 1 K"). Players drop off as their games kick off. (#34)

### Fixed
- The header's subtitle no longer runs under the week dropdown in the popup. It drops the week (the dropdown already shows it), a long username is cut short with "…", and **LIVE** always stays visible, now in red. (#36)

## 1.0.5 — 2026-09-13

### New
- **Version in Settings:** the bottom of Settings shows the version you're running (e.g. "Fantasy Sweat v1.0.5"), with a **What's new** link to the Releases page. (#28)
- **Closest matchups first:** a Settings option (Display) orders the league cards by how close each matchup is, with win chance nearest 50/50 at the top. (#31)
- **Update now:** Fantasy Sweat checks the Chrome Web Store for a newer version (when it opens, at most every 3 hours, and whenever Settings opens). If there is one, a bar offers **Update now** instead of waiting for Chrome to update it on its own. (#32)

### Changed
- **Live dot:** the dot by a player's points now shows only while his unit is on the field. It's green normally and red, fading in and out, in the red zone: his offense inside the other team's 20, or his D/ST defending its own. The live marker on game cards is solid red instead of flashing. (#24)
- **By player:** a Sort switch orders the lists by **Points** (as before) or by **Position**, meaning QB, RB, WR, TE, K, D/ST with highest points first within each. The choice is remembered. (#25)
- **Switching tabs** refreshes the scores, at most once every 10 seconds, so a tab you come back to isn't behind what Live plays showed. (#26)
- **Leaving Settings:** click the Fantasy Sweat logo (or ⚙ again) to go back to the main view. If you changed anything, it asks before throwing the changes away. (#30)

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
