# Changelog

What changed in each version of Fantasy Sweat on the Chrome Web Store, newest first. Every version also has a [GitHub Release](https://github.com/LilShrimper/FantasySweat/releases) listing the pull requests that went into it.

When the version in `manifest.json` goes up, rename **Unreleased** to that version and date in the same pull request; the publish workflow copies that section into the version's GitHub Release.

## Unreleased

### Changed
- **The layout survives a narrow window.** Everything was built around the popup's fixed 460px, so anything narrower — a phone, or a small browser window — pushed the game cards off the side of the screen. Below 455px the cheer and boo columns stack, the five tabs stay on one line with bigger tap targets, Settings puts each league's name above its nickname and color, and Pop out and Open in a full tab step aside. The popup itself is exactly 460px and is deliberately above the breakpoint, so it looks the same as it always did.

### Added
- **A website copy, for your phone.** The same page now runs at [lilshrimper.github.io/FantasySweat](https://lilshrimper.github.io/FantasySweat/) with nothing to install. Added to an iPhone's Home Screen it gets its own icon and name, opens without the browser's bars, keeps clear of the home-indicator bar, and still opens on a bad connection — the page itself is kept on the phone, while scores always come fresh from Sleeper and ESPN. Tapping a field in Settings no longer zooms the page in. The extension is unchanged.

## 1.0.25 — 2026-10-04

### Fixed
- **The margin matches the scores it came from.** The gap beside the verdict and the "Now" gap were rounded to a tenth, so a card reading 141.38 against 141.74 said "Now (−0.4)" when the subtraction is 0.36 — a number that matched neither score. Both now carry the hundredth, like the scores and projections above them, and a gap under a hundredth still reads as tied. (#92)

## 1.0.24 — 2026-10-04

### Fixed
- **Lead changes stay with their week.** Looking at an earlier week and coming back made every league card flash "Took the lead" or "Lost the lead", because the lead each league was in was remembered without which week it belonged to — so a finished week's scores read as this week's lead turning over. (#90)

## 1.0.23 — 2026-10-04

### New
- **In play:** a league card can carry an **in play** line above **yet to play** — "5 (1 QB, 2 RB, 1 TE, 1 D/ST) · in play · 5 (2 RB, 1 WR, 1 K, 1 D/ST)" — for the starters whose games are under way. The two lines split the players who can still score between them, so **yet to play** means the ones who haven't kicked off yet again, and a player moves from one line to the other when his game starts. Either line hides itself when neither side has anybody in that state, and a hairline separates the two when both are showing. (#86)
- **Which counts a card carries** is a Settings option (Display): only **yet to play**, as before and still the default; only **in play**; **in play** on the Live plays tab with **yet to play** everywhere else; **both** on Live plays and **yet to play** elsewhere; **both** everywhere, or **none**, which leaves both counts off the card altogether. (#86)
- **Return yards on turnovers:** a **Live plays** row for an interception or a recovered fumble says how far it was brought back — "+2 · PHI D/ST · DEF · 25 yd return". Some leagues score return yards, so those points were already in the number beside the play; now you can see where they came from. Blocked-kick and field-goal returns show it too. (#88)

### Fixed
- **Injury statuses keep up.** A player's Out or Questionable comes from Sleeper's projections feed, which was fetched once when a window opened and never again — so someone ruled out on Sleeper could still read as healthy here until the window was reopened. It's refetched every 10 minutes now, which is as fresh as Sleeper's own CDN serves it. (#87)
- **The points breakdown shows his status.** Clicking a player who is Questionable, Out, on IR and so on now carries the same badge his row does. (#87)
- **The comma** between the verdict and where the matchup stands — "Projected win (+2.5), Now (−11.9)" — takes the verdict's color instead of the margin's, so a red margin no longer drags a red comma in front of it. (#85)
- **Live plays: a corrected play no longer reads as a loss.** Sleeper's feed sometimes puts a correction in a play's stat row instead of the play's own numbers — "Lamar Jackson 52 Yd pass complete to Zay Flowers" arrived carrying −37 yards, so the catch showed as **−2.7** and the 52-yard gain never appeared at all. When a row's yardage runs the other way from the play's own description by more than 20 yards, the description wins and the play shows as the **+6.2** it was. Ordinary one- or two-yard differences are left alone, as are plays where the stats are right and the description is stale, like a touchdown wiped out by a holding penalty. Only Live plays and the latest-scoring-play tag were ever affected; player and team totals don't come from the play feed. (#84)

## 1.0.22 — 2026-10-04

### New
- **Order games within a kickoff window:** a Settings option (Display) — **Projected points in play** or **Players in the game**, counting both sides of your matchups. The windows themselves never move: Thursday, Sunday 1:00, the 4:05/4:25 block, Sunday night, Monday, the same windows the time filter uses, with live games first and byes last. The option only sorts the games inside one window. Until now they sat in whatever order your players happened to load in, so a 1:00 game with seven of your players could sit below one with a single player. (#79)

### Changed
- **Where you stand moved up to the verdict:** the top right of a league card now reads **"Projected win (+17.9), Now (+1.5)"** — where the matchup is heading, then where it stands. It used to sit beside your score. Green when you're up and red when you're down, so a card can say it's projected to win in green while **Now (−18.8)** sits in red beside it. (#81)
- **(tied) beside your score** no longer shows when neither team has scored. It said nothing on a card reading 0 against 0, which is every league where nobody has played yet. A real tie, both sides on the same number above zero, still shows. (#80)

### Fixed
- **A team defense's in-game projection.** Sleeper and ESPN both credit a D/ST with "0 points allowed" and "under 100 yards allowed" from the opening kickoff — about 10 points it gives back as the opponent moves the ball — and the projection was reading that as a scoring pace: a defense sitting on 13 at 0–0 was projected to finish near 20. A defense is now walked from its pre-game projection to the score it actually has as the clock runs, landing on its real points at the whistle. Every other position is unchanged. On Sleeper leagues this fed the card's projected total and win chance as well, so those ran a few points high whenever a defense was playing. (#82)

## 1.0.21 — 2026-10-01

### Fixed
- The margin beside your score writes one decimal, matching the verdict in the corner: "(−4.0)" rather than "(−4)". It showed up with an opponent sitting on exactly 4 points. (#77)
- Hovering that margin before your first player has scored used to read "15.6 behind their 15.6 right now", the same number twice. It now reads "You're 15.6 behind — 0.0 to their 15.6 · 10 of their starters can still score, so it can still move". (#77)

## 1.0.20 — 2026-09-30

### New
- **Where you stand, beside your score:** "104.7 **(+8.3)** proj 131.0" — how far you are from their score right now, green when you're up and red when you're down, "(tied)" when you're level. It's measured against their score, never their projection, so it can never tell you you're past a number that's still climbing. Hovering says whether that can still change: "45.1 behind their 133.2 right now · their starters are done, so that's the gap for good." It stays off until the week's first kickoff and goes once the matchup is final, where the verdict in the corner already gives the margin. (#75)
- **Lead changes:** when a league turns over from ahead to behind, or behind to ahead, while you have Fantasy Sweat open, the card says so for ten minutes — "▲ Took the lead · just now", "▼ Lost the lead · 6 min ago" — and pulses once while it's fresh. 0–0 at kickoff isn't a lead change, and a tie on the way through doesn't count as one either. (#75)

### Changed
- **Still to play is now left to play:** the line under the win bar leads with the number — "7 (3 RB, 1 WR, 1 TE, 1 K, 1 D/ST)  left to play  9 (1 QB, 2 RB, 4 WR, 1 K, 1 D/ST)" — and counts every starter whose game isn't over, not just the ones who haven't kicked off. A side in the middle of the afternoon games used to read as having nobody left when it had five players on the field. (#75)

## 1.0.19 — 2026-09-27

### Changed
- **Points breakdown:** the panel is titled with the player's full name — "Kyler Murray" where his row says "K. Murray", and "Minnesota Vikings D/ST" where it says "MIN D/ST". The rows themselves keep the short name. (#73)

## 1.0.18 — 2026-09-27

### Changed
- **Points that differ between leagues:** when your leagues score the same player differently — PPR against standard, a bonus for long field goals, and so on — his row leads with the number most of them give, the smaller one when they're split evenly, instead of his best league. Only the leagues that pay something else show it, on their own tag: **6.0** beside "+LS · +IJF 8.0 · +LFL". Hovering his points lists every league. Players scored the same everywhere, which is most of them, look exactly as they did. (#71)
- **The latest scoring play** beside a player's total, and the points on the **Live plays** tab, follow the same rule: the number most of your leagues give that play, with the odd league out on its tag. A play against you takes the smaller swing when they're split, so it isn't made out to be worse than it is. (#71)
- **Projections keep up with the games:** a player's **proj** is his in-game projection now — the pre-game number blended with what he's actually doing, leaning on it more as his game runs down, and settling on his real points once it's over. It used to sit on the pre-game number all afternoon while Sleeper's own app moved. It's the same formula the league cards' projected totals already used, so rows, rosters, the bench and the cards agree. (#71)
- **Projections across leagues** follow the points rule as well: they're worked out from each league's scoring too, so a league with richer scoring used to set the projection on every player it shares. Hovering a player's points or his projection lists what each league scores and projects him. Projections differ a little in almost every league, so unlike points they never go on the tags. (#71)

## 1.0.17 — 2026-09-27

### New
- **Since your last look:** open Fantasy Sweat after a while and a bar at the top says what moved, league by league: "Since your last look (1h ago): LS +12.4 / +3.1 · LFL +2 / +9.4" — your change, then your opponent's, biggest swing first, colored the way the rest of the app is — points for you green, points against you red. It takes up to two lines, and with more leagues than that ▾ opens the whole list. Hover for every league by name, with its win chance before and after; ✕ puts it away until next time. It only appears after at least 10 minutes away, for the week you were on, and only when something actually changed. A window sitting in the background doesn't count as looking, so a full tab left open behind other tabs still gets the bar when you come back to it. (#68, #69)
- **Injury warning:** a league card warns when one of your starters is listed **Out**, **IR**, **PUP**, **Suspended** or **Doubtful**, e.g. "⚠ Check your lineup: T. Etienne (RB · Out)". It shows only while his game hasn't kicked off, so a status that changes mid-game doesn't nag you. Questionable players, who usually play, aren't flagged. (#67)

## 1.0.16 — 2026-09-27

### Changed
- **Live plays:** each player's jersey number shows next to his name, like the other tabs, and every play says the down and where it started, e.g. "Q2 13:39 · 1st & 10 · NYJ 46 · NYJ @ DET". The time the play reached the feed moved to the hover text, so the line still fits on one line in the popup. (#64)

### Fixed
- **Live plays:** a D/ST play no longer shows the same league tag twice, and its points are the whole play instead of half of it. A sack-and-fumble that's worth 3 showed "+2" with two identical tags. (#63)
- **Live plays:** a team's own defense is no longer credited with forcing a fumble when that team's player is the one who fumbled. (#63)

## 1.0.15 — 2026-09-26

### New
- **Empty spot warning:** a league card warns when one of your starting spots has nobody in it, e.g. "⚠ Empty starting spot: FLEX", next to the bye week reminder. ESPN leagues now show empty spots in the roster panel too. (#61)

## 1.0.14 — 2026-09-17

### Changed
- **Final games:** on a game card, the winning team's name and score stand out in white while the losing team's are grayed out. A tie leaves both plain. (#59)
- **Kickoff times for future weeks** include the date, e.g. "Thu (9/24) 8:15 PM · Prime Video", on game cards, By NFL team and in the time filter. Games within the next 6 days still show just the day. (#58)

## 1.0.13 — 2026-09-16

### New
- **Team avatars:** league cards show a small avatar before your team's and your opponent's names: the team's Sleeper or ESPN logo, or its first letter when there isn't one. It's sized to the text, so the cards are no taller. Images only load from Sleeper's and ESPN's own servers; an ESPN logo linked from anywhere else shows the letter instead. (#55)
- **NFL logos on game and team cards:** each team in a game card's header, and each card in **By NFL team** (bye weeks included), has its logo before its name. Sized to the text, so the cards are no taller. (#56)

### Changed
- **League cards:** the verdict in the top right shows by how much, e.g. **Projected win (+17.9)** or **Projected loss (−5.6)** from the projected totals, and **Won (+12.4)** / **Lost (−3.1)** from the final scores. (#53)
- **Still to play** on league cards shows up once the week's first game kicks off (usually Thursday night). Before that, every starter is still to play, so the line was just repeating the lineup. (#54)

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
