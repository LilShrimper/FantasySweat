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
  const parts = (n, max) => { const p = api.sinceParts(summary(n), tagFor, max); return { rows: [...p.rows].map((r) => ({ ...r })), more: p.more }; };
  assert.deepEqual(parts(1), { rows: [{ tag: 'LS', me: 12.4, opp: 3.1 }], more: 0 });
  assert.deepEqual(parts(2).rows.map((r) => r.tag), ['LS', 'IJF']);
  // Beyond what fits, the rest are counted — the hover still lists them all.
  assert.equal(parts(4).more, 2);
  // A wider window (the full tab) names more of them.
  assert.equal(parts(4, 4).rows.length, 4);
  assert.equal(parts(4, 4).more, 0);
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
