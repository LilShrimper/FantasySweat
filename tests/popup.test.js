// Checks on the logic behind the extension: scoring a play, lineup warnings, formatting and the
// image allow-list. Run with `npm test` (or `node --test tests/`); nothing here ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPopup } from './load-popup.js';

const api = loadPopup();

// A league that scores the way most do, for the play tests below.
const scoring = { rec: 1, rec_yd: 0.1, rec_td: 6, sack: 1, fum_rec: 2, ff: 1, int: 2, qb_hit: 0, tkl: 0 };
const league = (name, id) => ({ league_id: id, name, scoring_settings: scoring });
// What the app calls an "ld": a league plus your side of its matchup.
const ldOf = (name, id) => ({ league: league(name, id), color: '#6c8cff' });
const player = (pid, pos, team, legs) => ({ pid, info: { name: pid, pos, team }, legs });
const myLeg = (ld) => ({ ld, side: 1, pts: 0, proj: 0 });
const theirLeg = (ld) => ({ ld, side: -1, pts: 0, proj: 0 });

test('leagueProj scores stats with a league\'s own settings', () => {
  assert.equal(api.leagueProj({ rec: 5, rec_yd: 80, rec_td: 1 }, scoring), 5 + 8 + 6);
  assert.equal(api.leagueProj({ rec_yd: 50, not_scored_here: 99 }, scoring), 5);
  assert.equal(api.leagueProj(null, scoring), 0);
});

test('scorePlay counts a D/ST play once, not once per feed row', () => {
  // Sleeper describes a defensive play twice: a row for the defense (sack) and idp_ rows for the
  // defenders who made it (fumble recovery). Scoring them separately used to double the league tag
  // and show only the larger half. Real play: "FUMBLE! Drake Maye sacked, fumble recovered by JAC".
  const ld = ldOf('Lil\' Shrimpers', 'L1');
  const jax = player('JAX', 'DEF', 'JAX', [myLeg(ld)]);
  const play = {
    stats: [
      { pid: '11564', team: 'NE', stats: { fum: 1, fum_lost: 1, idp_ff: 1, pass_sack: 1 } },
      { pid: '6972', team: 'JAX', stats: { idp_fum_rec: 1 } },
      { pid: 'JAX', team: 'JAX', stats: { qb_hit: 1, sack: 1, tkl: 1, tkl_solo: 1 } },
    ],
  };
  const { for: mine } = api.scorePlay(play, new Map([['JAX', jax]]), [jax]);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].pts, 3);          // sack 1 + fumble recovery 2
  assert.equal(mine[0].legs.length, 1);  // one league tag, not two
});

test('scorePlay does not credit a defense for its own team fumbling', () => {
  // The feed marks the forced fumble (idp_ff) on the row of the player who fumbled.
  const ld = ldOf('Lil\' Shrimpers', 'L1');
  const ne = player('NE', 'DEF', 'NE', [myLeg(ld)]);
  const play = {
    stats: [{ pid: '11564', team: 'NE', stats: { fum: 1, fum_lost: 1, idp_ff: 1, pass_sack: 1 } }],
  };
  const items = api.scorePlay(play, new Map([['NE', ne]]), [ne]);
  assert.equal(items.for.length + items.against.length, 0);
});

test('scorePlay adds up a player listed in more than one row, and splits for/against', () => {
  const mineLd = ldOf('Mine', 'L1');
  const theirsLd = ldOf('Theirs', 'L2');
  const wr = player('100', 'WR', 'DET', [myLeg(mineLd), theirLeg(theirsLd)]);
  const play = {
    stats: [
      { pid: '100', team: 'DET', stats: { rec: 1, rec_yd: 20 } },
      { pid: '100', team: 'DET', stats: { rec_yd: 20 } }, // same player, second row
    ],
  };
  const { for: mine, against: theirs } = api.scorePlay(play, new Map([['100', wr]]), []);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].pts, 5);   // 1 catch + 40 yards
  assert.equal(theirs.length, 1); // he's started against you in the other league
});

test('slimPlay keeps the down and spot from the feed', () => {
  const play = api.slimPlay({
    play_id: 'p1',
    metadata: {
      description: 'J.Goff pass complete.', quarter_name: '2', time_remaining_minutes: 13,
      time_remaining_seconds: 39, down: 1, distance: 10, yard_line: 46, yard_line_territory: 'NYJ',
    },
    play_stats: [{ player: { player_id: '100', team: 'DET' }, stats: { rec: 1 } }],
  });
  assert.equal(play.down, 1);
  assert.equal(play.dist, 10);
  assert.equal(play.spot, 'NYJ 46');
  assert.equal(play.clock, '13:39');
  assert.equal(play.stats.length, 1);
});

test('downSpot reads like a scoreboard, and skips what the feed leaves out', () => {
  assert.equal(api.downSpot({ down: 1, dist: 10, spot: 'NYJ 46' }), '1st & 10 · NYJ 46');
  assert.equal(api.downSpot({ down: 4, dist: 3, spot: 'BUF 13' }), '4th & 3 · BUF 13');
  assert.equal(api.downSpot({ down: 0, dist: 0, spot: 'DET 35' }), 'DET 35'); // kickoff
  assert.equal(api.downSpot({ down: 0, dist: 0, spot: '' }), '');
});

test('empty starting spots are listed in lineup order', () => {
  const ld = {
    league: league('L&D fantasy league', 'L1'),
    final: false,
    me: { roster: [
      { pid: '1', slot: 'QB' }, { pid: null, slot: 'K' }, { pid: null, slot: 'FLEX' },
      { pid: null, slot: 'BN' }, // an empty bench spot isn't a problem
    ] },
  };
  assert.equal(api.emptyLine(ld).textContent, '⚠ 2 empty starting spots: FLEX, K');
  assert.equal(api.emptyLine({ ...ld, final: true }), null);
  assert.equal(api.emptyLine({ ...ld, me: { roster: [{ pid: '1', slot: 'QB' }] } }), null);
});

test('bye week warning names the starters with no game', () => {
  const ld = {
    league: league('Lil\' Shrimpers', 'L1'),
    final: false,
    me: { roster: [
      { pid: '1', slot: 'QB', info: { name: 'J. Dart', pos: 'QB', team: 'NYG' }, game: { state: 'pre' } },
      { pid: '2', slot: 'WR', info: { name: 'T. McMillan', pos: 'WR', team: 'CAR' }, game: null },
      { pid: '3', slot: 'BN', info: { name: 'Benched', pos: 'RB', team: 'CAR' }, game: null },
      { pid: '4', slot: 'RB', info: { name: 'Free agent', pos: 'RB', team: null }, game: null },
    ] },
  };
  api.setCurrent({ model: { games: [{ id: '1', state: 'pre' }] } });
  assert.equal(api.byeLine(ld).textContent, '⚠ Starter on bye: T. McMillan (WR)');
  // With no schedule loaded, a missing game can't be told from a bye, so nothing is claimed.
  api.setCurrent({ model: { games: [] } });
  assert.equal(api.byeLine(ld), null);
});

test('what changed since your last look', () => {
  const snap = (at, week, leagues) => ({ at, week, leagues });
  const hour = 3600_000;
  const before = snap(1_000_000, 3, {
    L1: { me: 100, opp: 90, win: 0.61 },
    L2: { me: 50, opp: 80, win: 0.2 },
    L3: { me: 70, opp: 70, win: 0.5 }, // untouched while you were away
  });
  const after = snap(1_000_000 + 2 * hour, 3, {
    L1: { me: 112.4, opp: 93.1, win: 0.74 },
    L2: { me: 56.2, opp: 86.1, win: 0.18 },
    L3: { me: 70, opp: 70, win: 0.5 },
  });
  const s = api.lookSummary(before, after);
  assert.equal(s.leagues.length, 2);          // the matchup that didn't move is left out
  assert.equal(s.leagues[0].id, 'L1');        // biggest swing first (+12.4 vs +3.1)
  assert.equal(s.leagues[0].me, 12.4);
  assert.equal(s.leagues[0].opp, 3.1);
  assert.equal(s.leagues[1].id, 'L2');
  assert.equal(s.leagues[1].me, 6.2);
  assert.equal(api.agoText(s.away), '2h ago');

  // Nothing to say: no earlier look, a different week, too soon, or no change at all.
  assert.equal(api.lookSummary(null, after), null);
  assert.equal(api.lookSummary({ ...before, week: 2 }, after), null);
  assert.equal(api.lookSummary(snap(after.at - 60_000, 3, before.leagues), after), null);
  assert.equal(api.lookSummary(before, snap(before.at + 2 * hour, 3, before.leagues)), null);

  // A league hidden since the last look is skipped rather than counted as a change.
  const narrowed = api.lookSummary(before, snap(after.at, 3, { L1: after.leagues.L1 }));
  assert.equal(narrowed.leagues.length, 1);
  assert.equal(narrowed.leagues[0].me, 12.4);
});

test('the bar names each league rather than adding them together', () => {
  const tagFor = (id) => ({ L1: 'LS', L2: 'IJF', L3: 'LFL', L4: 'GLG' })[id];
  const summary = (n) => ({ away: 0, leagues: [
    { id: 'L1', me: 12.4, opp: 3.1 }, { id: 'L2', me: 6.2, opp: 6.1 },
    { id: 'L3', me: -2, opp: 4 }, { id: 'L4', me: 0.5, opp: 0 },
  ].slice(0, n) });
  const parts = (n) => [...api.sinceParts(summary(n), tagFor)].map((r) => ({ ...r }));
  assert.deepEqual(parts(1), [{ tag: 'LS', me: 12.4, opp: 3.1 }]);
  // Every league that moved is listed — the bar clamps to two lines and ▾ opens the rest.
  assert.deepEqual(parts(4).map((r) => r.tag), ['LS', 'IJF', 'LFL', 'GLG']);
  assert.deepEqual(parts(4)[2], { tag: 'LFL', me: -2, opp: 4 });
});

test('gains for you are green, gains against you are red', () => {
  assert.equal(api.sinceClass(12.4, true), 'good');   // you scored
  assert.equal(api.sinceClass(-2, true), 'bad');      // a correction took points off you
  assert.equal(api.sinceClass(9.4, false), 'bad');    // your opponent scored
  assert.equal(api.sinceClass(-1.5, false), 'good');
  assert.equal(api.sinceClass(0, true), '');          // no change, no color
  assert.equal(api.sinceClass(0, false), '');
});

test('how long you were away reads plainly', () => {
  assert.equal(api.agoText(25 * 60_000), '25 min ago');
  assert.equal(api.agoText(3 * 3600_000), '3h ago');
  assert.equal(api.agoText(50 * 3600_000), '2d ago');
});

test('a snapshot keeps every matchup, and skips leagues without one', () => {
  const ldOfWithSides = (id, me, opp, win) => ({
    league: league(id, id), me: { m: { points: me } }, opp: opp == null ? null : { m: { points: opp } }, winPct: win,
  });
  const snap = api.lookSnapshot({
    week: 4,
    model: { leagues: [ldOfWithSides('L1', 100, 90, 0.6), ldOfWithSides('L2', 50, null, 0.5)] },
  });
  assert.equal(snap.week, 4);
  assert.deepEqual(Object.keys(snap.leagues), ['L1']); // a bye week has no matchup to compare
  assert.deepEqual({ ...snap.leagues.L1 }, { me: 100, opp: 90, win: 0.6 });
});

test('a starter who probably will not play is flagged, but only before kickoff', () => {
  const starter = (name, pos, inj, state) => ({ pid: name, slot: pos, info: { name, pos, team: 'NYG', inj }, game: state ? { state } : null });
  const ld = {
    league: league('Lil\' Shrimpers', 'L1'),
    final: false,
    me: { roster: [
      starter('T. Etienne', 'RB', 'Out', 'pre'),
      starter('J. Dart', 'QB', 'Doubtful', 'pre'),
      starter('I. Likely', 'TE', 'Questionable', 'pre'), // questionable players usually play
      starter('A. Brown', 'WR', 'Out', 'in'),            // his game is on — nothing to do about it now
      starter('D. Moore', 'WR', 'IR', 'post'),           // game over
      { pid: 'bench', slot: 'BN', info: { name: 'Benched', pos: 'RB', team: 'NYG', inj: 'Out' }, game: { state: 'pre' } },
    ] },
  };
  assert.equal(api.sittingLine(ld).textContent, '⚠ Check your lineup: T. Etienne (RB · Out), J. Dart (QB · Doubtful)');
  assert.equal(api.sittingLine({ ...ld, final: true }), null);
  // Healthy lineup: no warning.
  assert.equal(api.sittingLine({ ...ld, me: { roster: [starter('T. Etienne', 'RB', null, 'pre')] } }), null);
  // Every status that counts, and one that doesn't.
  const only = (inj) => api.sittingStarters({ roster: [starter('X', 'RB', inj, 'pre')] }).length;
  for (const inj of ['Out', 'IR', 'PUP', 'Sus', 'Doubtful']) assert.equal(only(inj), 1, inj);
  assert.equal(only('Questionable'), 0);
});

test('safeAvatar only allows Sleeper and ESPN images', () => {
  assert.equal(api.safeAvatar('https://sleepercdn.com/avatars/thumbs/abc'), 'https://sleepercdn.com/avatars/thumbs/abc');
  assert.equal(api.safeAvatar('https://a.espncdn.com/i/teamlogos/nfl/500/dal.png'), 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png');
  assert.equal(api.safeAvatar('https://mystique-api.fantasy.espn.com/x.png'), 'https://mystique-api.fantasy.espn.com/x.png');
  assert.equal(api.safeAvatar('https://www.mensjournal.com/x.png'), null); // a custom ESPN logo elsewhere
  assert.equal(api.safeAvatar('https://sleepercdn.com.evil.io/x.png'), null); // look-alike host
  assert.equal(api.safeAvatar('http://sleepercdn.com/x.png'), null); // not https
  assert.equal(api.safeAvatar(''), null);
});

test('teamLogo asks ESPN for a small copy of its 500px logos', () => {
  assert.equal(
    api.teamLogo('https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/buf.png'),
    'https://a.espncdn.com/combiner/i?img=%2Fi%2Fteamlogos%2Fnfl%2F500%2Fscoreboard%2Fbuf.png&w=40&h=40',
  );
  assert.equal(api.teamLogo('https://www.mensjournal.com/x.png'), null);
});

test('isNewer compares version numbers, not text', () => {
  assert.equal(api.isNewer('1.0.10', '1.0.9'), true);   // "1.0.10" sorts before "1.0.9" as text
  assert.equal(api.isNewer('1.0.9', '1.0.10'), false);
  assert.equal(api.isNewer('1.1', '1.0.16'), true);
  assert.equal(api.isNewer('1.0.16', '1.0.16'), false);
});

test('live stats replace a matchup score only while a game is in progress', () => {
  const makeLd = () => ({
    league: league('Lil\' Shrimpers', 'L1'),
    me: { m: { starters: ['live', 'final', 'pre'], players_points: { live: 10, final: 20, pre: 0, bench: 3 }, points: 30 } },
    opp: null,
  });
  const games = { NYG: { state: 'in' }, KC: { state: 'post' }, BUF: { state: 'pre' } };
  const proj = {
    live: { team: 'NYG', player: { first_name: 'A', last_name: 'A', position: 'WR' } },
    final: { team: 'KC', player: { first_name: 'B', last_name: 'B', position: 'WR' } },
    pre: { team: 'BUF', player: { first_name: 'C', last_name: 'C', position: 'WR' } },
    bench: { team: 'NYG', player: { first_name: 'D', last_name: 'D', position: 'WR' } },
  };
  const stats = new Map([
    ['live', { rec: 5, rec_yd: 80, rec_td: 1 }], // 19, up from 10
    ['final', { rec: 9, rec_yd: 150 }],          // ignored: his game is over
    ['bench', { rec: 1, rec_yd: 5 }],            // counts for him, not the team total
  ]);
  const data = [makeLd()];
  api.liveScores(data, stats, games, proj, null);
  assert.equal(data[0].me.m.players_points.live, 19);
  assert.equal(data[0].me.m.players_points.final, 20);
  assert.equal(data[0].me.m.points, 39); // team total moves by the live starter's change only
  assert.deepEqual([...data[0].me.m.live].sort(), ['bench', 'live']);

  // If the stats don't load, everything keeps Sleeper's own numbers.
  const untouched = [makeLd()];
  api.liveScores(untouched, null, games, proj, null);
  assert.equal(untouched[0].me.m.points, 30);
  assert.equal(untouched[0].me.m.live, undefined);
});

test('points and projections read like Sleeper', () => {
  assert.equal(api.fmt2(129.89), '129.89');
  assert.equal(api.fmt2(134.1), '134.1');
  assert.equal(api.fmt2(134), '134.0');
  assert.equal(api.signed(7.4), '+7.4');
  assert.equal(api.signed(-0.3), '−0.3');
  assert.equal(api.signed(0), '0');
});

test('win chance follows the score, and settles once both sides are done', () => {
  assert.equal(api.sleeperWinProb(100, 100, 90, 90), 1);   // final, you're ahead
  assert.equal(api.sleeperWinProb(90, 90, 100, 100), 0);
  assert.ok(Math.abs(api.sleeperWinProb(50, 120, 50, 120) - 0.5) < 1e-9); // dead even
  const ahead = api.sleeperWinProb(80, 120, 40, 110);
  assert.ok(ahead > 0.5 && ahead <= 0.99);
});

test('stat labels cover the tiers Sleeper sends', () => {
  assert.equal(api.statLabel('rec_yd'), 'Receiving yards');
  assert.equal(api.statLabel('pts_allow_28_34'), '28–34 points allowed');
  assert.equal(api.statLabel('yds_allow_550p'), '550+ yards allowed');
  assert.equal(api.statLabel('some_new_stat'), 'Some new stat'); // unknown keys still read as words
});

test('a player scored differently in each league leads with the number most of them give', () => {
  const legs = (...pts) => pts.map((p) => ({ pts: p }));
  // Reichard: 50-yard FG worth 5 in two leagues, 5.5 plus a 1.5 bonus in the third.
  assert.equal(api.headlinePts(legs(6, 8, 6)), 6);
  assert.equal(api.legPtsVary(legs(6, 8, 6)), true);
  // Split evenly: the lower number leads, so the row never quotes his best league.
  assert.equal(api.headlinePts(legs(15, 17)), 15);
  assert.equal(api.headlinePts(legs(42.9, 35.3)), 35.3);
  // One league, or leagues that agree: nothing changes and no chip carries a number.
  assert.equal(api.headlinePts(legs(9.4)), 9.4);
  assert.equal(api.headlinePts(legs(9.4, 9.4, 9.4)), 9.4);
  assert.equal(api.legPtsVary(legs(9.4, 9.4, 9.4)), false);
  // Hundredths apart is a real difference; rounding noise below a cent isn't.
  assert.equal(api.legPtsVary(legs(9.41, 9.4)), true);
  assert.equal(api.legPtsVary(legs(9.4, 9.4001)), false);
  assert.equal(api.samePts(6, 6.001), true);
});

test('a play worth more in one league leads with what most of them pay', () => {
  // Half PPR in two leagues, full PPR in the third: a 10-yard catch is 1.5 / 1.5 / 2.
  const half = { ...scoring, rec: 0.5 };
  const ldWith = (name, id, s) => ({ league: { league_id: id, name, scoring_settings: s }, color: '#6c8cff' });
  const a = ldWith('Half A', 'L1', half), b = ldWith('Half B', 'L2', half), c = ldWith('Full', 'L3', scoring);
  const wr = player('100', 'WR', 'DET', [myLeg(a), myLeg(b), myLeg(c)]);
  const play = { stats: [{ pid: '100', team: 'DET', stats: { rec: 1, rec_yd: 10 } }] };
  const { for: mine } = api.scorePlay(play, new Map([['100', wr]]), []);
  assert.equal(mine[0].pts, 1.5);                              // not the 2 the one full-PPR league pays
  assert.equal(mine[0].legs.length, 3);                        // every league still gets its chip
  assert.deepEqual([...mine[0].legs].map((l) => l.pts), [1.5, 1.5, 2]); // spread: the vm's arrays aren't ours
});

test('split evenly, the headline takes the smaller swing either way', () => {
  const legs = (...pts) => pts.map((p) => ({ pts: p }));
  assert.equal(api.headlinePts(legs(15, 17)), 15);
  assert.equal(api.headlinePts(legs(-1, -2)), -1); // a play against you isn't made out worse than it is
});

test('projections lead the same way as points', () => {
  const legs = (...proj) => proj.map((p) => ({ proj: p }));
  // Every league projects him a little differently, so none of them is "most": the smallest leads,
  // rather than the row advertising his best league's projection.
  assert.equal(api.headlineProj(legs(10.63, 9.88, 9.9)), 9.88);
  assert.equal(api.headlineProj(legs(12.4, 9.9, 9.9)), 9.9); // two agree, so they win
  assert.equal(api.headlineProj(legs(14.71)), 14.71);
  assert.equal(api.legProjVary(legs(9.9, 9.9)), false);
  assert.equal(api.legProjVary(legs(9.9, 10.63)), true);
});

test('a projection follows the game: pre-game, then Sleeper\'s blend, then his real points', () => {
  const pre = { state: 'pre' }, half = { state: 'in', period: 2, clock: 731 }, done = { state: 'post' };
  // Before kickoff it's untouched.
  assert.equal(api.liveProj(0, 5.8, pre, false), 5.8);
  // Reichard at MIN @ TB, Q2 with 42.2 minutes left: 6 so far against a 5.8 pre-game projection.
  // Sleeper showed 8.97 for exactly this state.
  assert.ok(Math.abs(api.liveProj(6, 5.8, half, false) - 8.97) < 0.005);
  // Once his game is over the projection is just what he scored.
  assert.equal(api.liveProj(7.3, 10.81, done, false), 7.3);
  // On a bye he has no game, so there's nothing to blend with.
  assert.equal(api.liveProj(0, 9.4, null, false), 9.4);
  // Scoreboard didn't load: treat everyone as not started rather than as finished at 0.
  assert.equal(api.liveProj(0, 9.4, null, true), 9.4);
});

test('a player has both a short name for the rows and a full one for the breakdown', () => {
  const dump = { '1': ['Kyler', 'Murray', 'QB', 'ARI', null, 1, null], 'MIN': ['Minnesota', 'Vikings', 'DEF', 'MIN', null, null, null] };
  const proj = { '2': { player: { first_name: 'Will', last_name: 'Reichard', position: 'K', team: 'MIN' }, team: 'MIN' } };
  const kyler = api.playerInfo('1', proj, dump, {});
  assert.equal(kyler.name, 'K. Murray');
  assert.equal(kyler.full, 'Kyler Murray');
  const will = api.playerInfo('2', proj, dump, {});
  assert.equal(will.name, 'W. Reichard');
  assert.equal(will.full, 'Will Reichard');
  // A defense keeps its abbreviation on the rows and gets its city and nickname in the breakdown.
  const def = api.playerInfo('MIN', proj, dump, {});
  assert.equal(def.name, 'MIN D/ST');
  assert.equal(def.full, 'Minnesota Vikings D/ST');
  // Nobody knows who he is: both names say the same thing rather than one of them being empty.
  const unknown = api.playerInfo('999', {}, {}, {});
  assert.equal(unknown.name, unknown.full);
});

test('a margin is the exact gap between the two numbers on the card', () => {
  // The verdict's margin comes from the projections printed beside it, so it has to match them:
  // 141.95 against 142.52 is 0.57. Rounding to a tenth left "(−0.6)" matching neither.
  assert.equal(api.fmtDiff(141.95 - 142.52), '−0.57');
  assert.equal(api.fmtDiff(141.38 - 141.74), '−0.36');
  assert.equal(api.fmtDiff(17.9), '+17.9');   // a trailing zero still goes, like the scores
  assert.equal(api.fmtDiff(-4), '−4.0');      // but never a bare "−4"
  assert.equal(api.fmtDiff(0.004), '');       // under a hundredth is a dead heat, not "+0.0"
  assert.equal(api.fmtDiff(0), '');
});

test('the margin beside your score is measured against their score, never their projection', () => {
  const side = (points, roster, proj) => ({ m: { points }, roster, proj });
  const starter = (state, pos = 'RB') => ({ pid: '1', slot: pos, info: { pos }, game: { state } });
  // His projection says 120 and hers says 129, and neither number is allowed to matter here.
  const me = side(104.7, [starter('in'), starter('pre'), starter('post')], 120);
  const opp = side(118.9, [starter('in'), starter('post')], 129);
  assert.equal(api.marginText(me, opp).text, '(−14.2)');
  assert.equal(api.marginText(me, opp).tone, 'behind');
  assert.equal(api.marginText(opp, me).text, '(+14.2)');
  assert.equal(api.marginText(opp, me).tone, 'ahead');
  // Ahead of their projection but behind their score is behind, full stop.
  assert.equal(api.marginText(side(125, [starter('in')], 120), opp).text, '(+6.1)');
  assert.equal(api.marginText(side(110, [starter('in')], 200), opp).text, '(−8.9)');
  assert.equal(api.marginText(side(96, []), side(96, [])).text, '(tied)');
  // Level on nothing isn't worth saying: no margin at all until somebody scores.
  assert.equal(api.marginText(side(0, []), side(0, [])).text, '');
  assert.equal(api.marginText(side(0, []), side(0, [])).tone, 'none');
  assert.equal(api.marginText(side(0.2, []), side(0.2, [])).text, '(tied)'); // but 0.2 apiece is a real tie
  // To the hundredth, like the verdict's margin in the corner — never a bare "(−4)".
  assert.equal(api.marginText(side(0, []), side(4, [])).text, '(−4.0)');
  assert.equal(api.marginText(side(104.74, []), side(96.4, [])).text, '(+8.34)');
  // The gap has to be the subtraction you'd do yourself: 141.38 against 141.74 is 0.36, not 0.4.
  assert.equal(api.marginText(side(141.38, []), side(141.74, [])).text, '(−0.36)');
  // Closer than a hundredth is a tie, not "(+0.0)".
  assert.equal(api.marginText(side(96.004, []), side(96, [])).text, '(tied)');
  assert.match(api.marginText(side(0, []), side(15.6, [])).title, /^You're 15.6 behind — 0.0 to their 15.6/);
  // Nothing claims a lead is safe while they can still score, and nothing anywhere says "clear".
  assert.match(api.marginText(me, opp).title, /can still move/);
  assert.match(api.marginText(me, side(118.9, [starter('post')])).title, /the gap for good/);
  assert.doesNotMatch(api.marginText(side(125, [], 120), opp).title, /clear/);
});

test('"yet to play" counts everyone who can still score, with the positions', () => {
  const starter = (state, pos) => ({ pid: pos + state, slot: pos, info: { pos }, game: { state } });
  const side = {
    roster: [
      starter('pre', 'QB'), starter('in', 'RB'), starter('pre', 'RB'), starter('post', 'WR'),
      starter('in', 'K'), starter('pre', 'DEF'),
      { pid: 'b1', slot: 'BN', info: { pos: 'WR' }, game: { state: 'pre' } }, // bench doesn't count
      { pid: null, slot: 'FLEX' },                                            // nor an empty spot
      { pid: 'bye', slot: 'TE', info: { pos: 'TE' }, game: null },            // nor a player on bye
    ],
  };
  // The two lines split the starters who can still score: on the field now, and not kicked off yet.
  const playing = api.playingNow(side);
  assert.equal(playing.n, 2);
  assert.equal(playing.text, '1 RB, 1 K');
  const left = api.yetToPlay(side);
  assert.equal(left.n, 3);                            // the two who are playing have moved off it
  assert.equal(left.text, '1 QB, 1 RB, 1 D/ST');      // in Sleeper's position order
  assert.equal(api.canStillScore(side), 5);           // and together they're everyone who's left
  // The WR whose game is finished is in neither, and nor is the bench, the empty spot or the bye.
  assert.equal(api.playingNow({ roster: [starter('post', 'QB')] }).n, 0);
  assert.equal(api.yetToPlay({ roster: [starter('post', 'QB')] }).n, 0);
  assert.equal(api.yetToPlay(null).n, 0);
  assert.equal(api.canStillScore(null), 0);
});

test('a lead change is noted once, and 0-0 at kickoff is not one', () => {
  const league = (points, oppPoints) => ({
    league: { league_id: 'L1' }, me: { m: { points } }, opp: { m: { points: oppPoints } }, final: false,
  });
  const run = (ld, week = 4) => api.trackLeads({ week, model: { leagues: [ld] } });
  api.leadSeen.clear(); api.leadFlips.clear();
  run(league(0, 0));            // kickoff: tied, nothing to say
  assert.equal(api.leadFlips.size, 0);
  run(league(6.2, 0));          // first points: ahead, but that's not a change of lead
  assert.equal(api.leadFlips.size, 0);
  assert.equal(api.leadState({ m: { points: 6.2 } }, { m: { points: 0 } }), 'up');
  run(league(6.2, 14.9));       // they go ahead: that's a flip
  assert.equal(api.leadFlips.get('4:L1:').up, false);
  run(league(6.2, 14.9));       // nothing changed, so the note stays as it was
  assert.equal(api.leadFlips.get('4:L1:').up, false);
  run(league(20.1, 14.9));      // back ahead
  assert.equal(api.leadFlips.get('4:L1:').up, true);
  // A tie on the way through doesn't count as a change, and doesn't forget who was ahead.
  run(league(20.1, 20.1));
  assert.equal(api.leadSeen.get('4:L1:'), 'up');
  assert.equal(api.flipWhen(20_000), 'just now');
  assert.equal(api.flipWhen(6 * 60_000), '6 min ago');
});

test('looking back at an earlier week doesn\'t move this week\'s lead', () => {
  const league = (points, oppPoints, final = false) => ({
    league: { league_id: 'L1' }, me: { m: { points } }, opp: { m: { points: oppPoints } }, final,
  });
  const run = (ld, week) => api.trackLeads({ week, model: { leagues: [ld] } });
  api.leadSeen.clear(); api.leadFlips.clear();
  run(league(90.68, 98.9), 4);                 // this week: you're behind
  assert.equal(api.leadFlips.size, 0);
  run(league(138.98, 100.92, true), 2);        // week 2, finished and won — a different week's story
  run(league(78.56, 122.5, true), 2);          // and another league's week 2
  assert.equal(api.leadFlips.size, 0);         // nothing announced for a week that's over
  run(league(90.68, 98.9), 4);                 // back to this week, unchanged
  assert.equal(api.leadFlips.size, 0);         // so no "took the lead" on the way back
  assert.equal(api.leadSeen.get('4:L1:'), 'down');
  assert.equal(api.leadSeen.get('2:L1:'), 'down');
  // A real change this week still counts.
  run(league(101.2, 98.9), 4);
  assert.equal(api.leadFlips.get('4:L1:').up, true);
});

test('pulling down has to travel before it refreshes', () => {
  assert.equal(api.pullOffset(-30), 0);            // pushing up is not a pull
  assert.equal(api.pullOffset(60), 30);            // half speed
  assert.ok(api.pullOffset(100) < api.PULL_READY); // a short tug lets go without refreshing
  assert.ok(api.pullOffset(130) >= api.PULL_READY);
  assert.equal(api.pullOffset(900), 96);           // and it stops rather than following off the screen
});

test('the phone header says how long ago the scores arrived', () => {
  assert.equal(api.updatedAgo(0), 'just now');
  assert.equal(api.updatedAgo(9_900), 'just now');
  assert.equal(api.updatedAgo(10_000), '10s ago');
  assert.equal(api.updatedAgo(29_000), '20s ago');   // by tens, rounded down: never ahead of the truth
  assert.equal(api.updatedAgo(59_999), '50s ago');
  assert.equal(api.updatedAgo(60_000), '1 min ago');
  assert.equal(api.updatedAgo(5 * 60_000), '5 min ago');
});

test('switching to a leaguemate and back is not a lead change', () => {
  // One league, one week, seen from two teams: yours (roster 3, ahead) and a leaguemate's (roster 7, behind).
  const league = (key, points, oppPoints) => ({
    league: { league_id: 'L1' }, me: { key, m: { points } }, opp: { m: { points: oppPoints } }, final: false,
  });
  const run = (ld) => api.trackLeads({ week: 4, model: { leagues: [ld] } });
  api.leadSeen.clear(); api.leadFlips.clear();
  run(league('3', 204.4, 133.3));   // you: ahead
  run(league('7', 88.1, 120.6));    // switch the username to them: behind
  run(league('3', 204.4, 133.3));   // and back to you
  assert.equal(api.leadFlips.size, 0);            // nobody took or lost anything
  assert.equal(api.leadSeen.get('4:L1:3'), 'up');
  assert.equal(api.leadSeen.get('4:L1:7'), 'down');
  // Each team's own lead changes still count, on its own card.
  run(league('3', 204.4, 210.2));
  assert.equal(api.leadFlips.get('4:L1:3').up, false);
  assert.equal(api.leadFlips.has('4:L1:7'), false);
});

test('the margin says which way it goes, so the card can color it', () => {
  const side = (points, roster) => ({ m: { points }, roster });
  const starter = () => ({ pid: '1', slot: 'RB', info: { pos: 'RB' }, game: { state: 'in' } });
  const up = side(120, [starter()]), down = side(100, [starter()]), same = side(120, [starter()]);
  assert.equal(api.marginText(up, down).tone, 'ahead');   // green
  assert.equal(api.marginText(down, up).tone, 'behind');  // red
  assert.equal(api.marginText(up, same).tone, 'tied');    // plain
});

test('kickoff windows keep their order; the Settings option sorts inside one', () => {
  // A real week: Thursday night, Sunday 1:00, the 4:05/4:25 block (one window, 20 minutes apart),
  // Sunday night, Monday night.
  const at = (day, h, m) => new Date(2026, 9, day, h, m);
  const g = (id, date, players, projStake, state = 'pre') => ({ id, state, date, players: new Array(players).fill(0), projStake });
  const list = [
    g('thu', at(1, 20, 15), 1, 30),
    g('one-a', at(4, 13, 0), 3, 40),
    g('one-b', at(4, 13, 0), 7, 25),
    g('four-05', at(4, 16, 5), 1, 20),
    g('four-25', at(4, 16, 25), 4, 95),
    g('sun-night', at(4, 20, 20), 7, 120),
    g('mon', at(5, 20, 15), 2, 15),
    { id: 'bye', none: true, players: [] },
  ];
  const ids = (how) => api.sortGames(list, how).map((x) => x.id);
  // Sunday night has the most points of any game and Monday the fewest, and neither moves: the
  // windows run Thursday, 1:00, 4:00, Sunday night, Monday whatever the option says.
  assert.deepEqual([...ids('points')], ['thu', 'one-a', 'one-b', 'four-25', 'four-05', 'sun-night', 'mon', 'bye']);
  // Only the order inside a window changes: the two 1:00 games swap on player count, and the
  // 4:05 and 4:25 games are one window, so they swap too.
  assert.deepEqual([...ids('players')], ['thu', 'one-b', 'one-a', 'four-25', 'four-05', 'sun-night', 'mon', 'bye']);
  // An unknown saved value behaves like points rather than throwing.
  assert.deepEqual([...ids('nonsense')], [...ids('points')]);
  // A live game still comes first and a finished one still goes last, whatever window they're in.
  const mixed = [g('mon-live', at(5, 20, 15), 1, 5, 'in'), g('one-done', at(4, 13, 0), 9, 99, 'post'), g('four', at(4, 16, 25), 2, 50)];
  assert.deepEqual([...api.sortGames(mixed, 'points').map((x) => x.id)], ['mon-live', 'four', 'one-done']);
  // Sorting doesn't disturb the list it was handed.
  assert.equal(list[1].id, 'one-a');
});

test('a defense is walked to its score, not extrapolated from an early shutout', () => {
  const half = { state: 'in', period: 3, clock: 900 }; // a quarter and a half left: half the game
  const kick = { state: 'pre' }, done = { state: 'post' };
  // GB D/ST at 0-0 early: 13 points, 10 of which are "0 points allowed" and "under 100 yards" that
  // it hasn't earned yet. The old blend read that as a pace and projected ~20.
  assert.ok(api.sleeperLiveProj(13, 6.19, 2700) > 18);           // what a skill player would get
  const def = api.liveProj(13, 6.19, { state: 'in', period: 2, clock: 900 }, false, 'DEF');
  assert.ok(def > 6.19 && def < 10, `defense projected ${def}`); // between the two, nowhere near 20
  // Halfway through: halfway between the pre-game number and what it has.
  assert.ok(Math.abs(api.liveProj(13, 6.19, half, false, 'DEF') - (6.19 + 13) / 2) < 0.01);
  // The ends are exact: the pre-game number at kickoff, the real score at the whistle.
  assert.equal(api.liveProj(0, 8.26, kick, false, 'DEF'), 8.26);
  assert.equal(api.liveProj(4, 8.26, done, false, 'DEF'), 4);
  // A defense that really is having a day still climbs, just without the early spike.
  assert.ok(api.liveProj(24, 7, half, false, 'DEF') > 15);
  // Every other position is untouched.
  assert.equal(api.liveProj(13, 6.19, half, false, 'WR'), api.sleeperLiveProj(13, 6.19, 1800));
  assert.equal(api.liveProj(13, 6.19, half, false), api.sleeperLiveProj(13, 6.19, 1800));
});

test('a play whose stats run the other way is read from its description', () => {
  // The real one: Sleeper sent -37 for a 52-yard catch, so it scored as a loss and the gain never
  // showed up on Live plays.
  const desc = 'Lamar Jackson 52 Yd pass complete to Zay Flowers';
  assert.equal(api.playYards(desc), 52);
  const fixed = api.fixYards({ rec: 1, rec_tgt: 1, rec_yar: -37, rec_yd: -37 }, 52);
  assert.deepEqual({ ...fixed }, { rec: 1, rec_tgt: 1, rec_yar: 52, rec_yd: 52 });
  assert.deepEqual({ ...api.fixYards({ pass_att: 1, pass_cmp: 1, pass_yd: -37 }, 52) },
    { pass_att: 1, pass_cmp: 1, pass_yd: 52 });
  // A genuine loss agrees with its description, so nothing is touched.
  const loss = { rec: 1, rec_tgt: 1, rec_yar: 2, rec_yd: -3 };
  assert.deepEqual({ ...api.fixYards(loss, api.playYards('Jacoby Brissett -3 Yd pass complete to Trey McBride')) }, loss);
  // Normal spotting drift of a yard or two is left alone, in both directions.
  assert.deepEqual({ ...api.fixYards({ rush_yd: 1 }, -2) }, { rush_yd: 1 });
  assert.deepEqual({ ...api.fixYards({ rec_yd: 6 }, 7) }, { rec_yd: 6 });
  // A touchdown wiped out by a penalty: the stats are right and the description is stale, and since
  // they run the same way the stats keep their number.
  assert.deepEqual({ ...api.fixYards({ rush_att: 1, rush_yd: 5 }, 39) }, { rush_att: 1, rush_yd: 5 });
  // No yardage in the description (a kickoff, an extra point): nothing to compare against.
  assert.equal(api.playYards('Two Point Conversion attempt failed'), null);
  assert.deepEqual({ ...api.fixYards({ rec_yd: -37 }, null) }, { rec_yd: -37 });
});

test('slimPlay carries the corrected yardage through to scoring', () => {
  const play = api.slimPlay({
    play_id: 'p9',
    metadata: { fantasy_description: 'Lamar Jackson 52 Yd pass complete to Zay Flowers', sequence: '1' },
    play_stats: [
      { player: { player_id: '9997', team: 'BAL' }, stats: { rec: 1, rec_tgt: 1, rec_yd: -37 } },
      { player: { player_id: '4881', team: 'BAL' }, stats: { pass_att: 1, pass_cmp: 1, pass_yd: -37 } },
    ],
  });
  assert.equal([...play.stats][0].stats.rec_yd, 52);
  // Full PPR: a catch plus 5.2 for the yards, instead of the −2.7 the raw row produced.
  const ppr = { rec: 1, rec_yd: 0.1, pass_yd: 0.04 };
  assert.ok(Math.abs(api.leagueProj([...play.stats][0].stats, ppr) - 6.2) < 1e-9);
  assert.ok(Math.abs(api.leagueProj([...play.stats][1].stats, ppr) - 2.08) < 1e-9);
});

test('the Settings option picks which counts a card carries, by tab', () => {
  const shown = (mode, onLivePlays) => {
    const m = api.LINE_MODES[mode];
    return [m.playing(onLivePlays) ? 'in play' : null, m.toPlay(onLivePlays) ? 'yet to play' : null].filter(Boolean);
  };
  // elsewhere, then on the Live plays tab
  assert.deepEqual(shown('yet', false), ['yet to play']);
  assert.deepEqual(shown('yet', true), ['yet to play']);          // the default, unchanged by tab
  assert.deepEqual(shown('play', false), ['in play']);
  assert.deepEqual(shown('play', true), ['in play']);
  assert.deepEqual(shown('play-live', false), ['yet to play']);
  assert.deepEqual(shown('play-live', true), ['in play']);          // swaps on Live plays
  assert.deepEqual(shown('both-live', false), ['yet to play']);
  assert.deepEqual(shown('both-live', true), ['in play', 'yet to play']);
  assert.deepEqual(shown('both', false), ['in play', 'yet to play']);
  assert.deepEqual(shown('both', true), ['in play', 'yet to play']);
  // Every option offered in Settings is one the card knows how to draw.
  assert.deepEqual([...shown('none', false), ...shown('none', true)], []); // the card carries neither
  assert.deepEqual(Object.keys({ ...api.LINE_MODES }).sort(), ['both', 'both-live', 'none', 'play', 'play-live', 'yet']);
});

test('the projections cache goes stale, so a status change gets through', () => {
  const ttl = 10 * 60_000;
  const cache = { key: '2026-4-regular', t: 1_000_000, map: {} };
  assert.equal(api.cacheFresh(cache, '2026-4-regular', ttl, cache.t + 9 * 60_000), true);
  assert.equal(api.cacheFresh(cache, '2026-4-regular', ttl, cache.t + ttl), false);       // ten minutes on
  assert.equal(api.cacheFresh(cache, '2026-5-regular', ttl, cache.t + 1000), false);      // another week
  assert.equal(api.cacheFresh(null, '2026-4-regular', ttl, 1), false);                    // nothing cached yet
});

test('a turnover brought back shows its return yards', () => {
  // The defender's own row, and the same play once it's rolled into his team's defense.
  assert.equal(api.returnYards({ idp_int: 1, idp_int_ret_yd: 15 }), 15);
  assert.equal(api.returnYards({ int: 1, int_ret_yd: 15 }), 15);
  assert.equal(api.returnYards({ idp_fum_rec: 1, idp_fum_rec_ret_yd: 32 }), 32);
  assert.equal(api.returnYards({ blk_kick_ret_yd: 8 }), 8);
  // Nothing to say when the ball wasn't brought back, or on a play that isn't a turnover.
  assert.equal(api.returnYards({ idp_int: 1 }), 0);
  assert.equal(api.returnYards({ idp_int: 1, idp_int_ret_yd: 0 }), 0);
  assert.equal(api.returnYards({ rec: 1, rec_yd: 52 }), 0);   // receiving yards aren't a return
  assert.equal(api.returnYards(null), 0);
});

test('scorePlay hands the row the stats behind the points', () => {
  // An IDP league, where the defender is scored on his own line rather than through a team defense.
  const ld = { league: { league_id: 'L1', name: 'IDP', scoring_settings: { idp_int: 4, idp_int_ret_yd: 0.1 } }, color: '#6c8cff' };
  const lb = player('100', 'LB', 'JAX', [myLeg(ld)]);
  const play = { stats: [{ pid: '100', team: 'JAX', stats: { idp_int: 1, idp_int_ret_yd: 5 } }] };
  const { for: mine } = api.scorePlay(play, new Map([['100', lb]]), []);
  assert.equal(api.returnYards(mine[0].stats), 5);
});
