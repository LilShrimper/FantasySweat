'use strict';

const SLEEPER = 'https://api.sleeper.app/v1';
const PROJ = 'https://api.sleeper.com/projections/nfl';
const STATS = 'https://api.sleeper.com/stats/nfl';
const POS_QS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'].map((p) => `position[]=${p}`).join('&');
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_FANTASY = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
// ESPN's NFL team ids (the same ids its scoreboard uses), its positions, and its non-starting slots.
const ESPN_TEAMS = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN',
  11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ',
  21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX',
  33: 'BAL', 34: 'HOU',
};
const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const ESPN_BENCH_SLOTS = new Set([20, 21]); // bench, IR
// Lineup slot labels for the roster panel. ESPN numbers its slots; Sleeper names them (a few shortened).
const ESPN_SLOTS = { 0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP', 16: 'DEF', 17: 'K', 20: 'BN', 21: 'IR', 23: 'FLEX' };
const SLEEPER_SLOTS = { SUPER_FLEX: 'SF', REC_FLEX: 'FLEX', WRRB_FLEX: 'FLEX', IDP_FLEX: 'IDP' };
const SLOT_ORDER = ['QB', 'RB', 'RB/WR', 'WR', 'WR/TE', 'TE', 'FLEX', 'OP', 'SF', 'K', 'DEF', 'BN', 'IR', 'TAXI'];
// ESPN scoring stat ids → Sleeper stat keys, so Sleeper's play-by-play can be scored with an ESPN
// league's rules on the Live plays tab. Points/yards-allowed tiers aren't per play, so they're left out.
const ESPN_STAT_KEYS = {
  3: ['pass_yd'], 4: ['pass_td'], 19: ['pass_2pt'], 20: ['pass_int'],
  24: ['rush_yd'], 25: ['rush_td'], 26: ['rush_2pt'],
  42: ['rec_yd'], 43: ['rec_td'], 44: ['rec_2pt'], 53: ['rec'],
  63: ['fum_rec_td'], 72: ['fum_lost'],
  74: ['fgm_50p'], 77: ['fgm_40_49'], 80: ['fgm_0_19', 'fgm_20_29', 'fgm_30_39'], 198: ['fgm_50_59'], 201: ['fgm_60p'],
  85: ['fgmiss'], 86: ['xpm'], 88: ['xpmiss'],
  93: ['def_td'], 94: ['def_td'], 95: ['int'], 96: ['fum_rec'], 97: ['blk_kick'], 98: ['safe'], 99: ['sack'],
  103: ['def_td'], 104: ['def_td'],
};
const LEAGUE_COLORS = ['#6c8cff', '#f58b3d', '#c05cff', '#29b8d8', '#e8c547', '#ff6fae', '#7bd148', '#a0785a'];
const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};
const LIVE_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;
const TAB_REFRESH_LOCKOUT_MS = 10_000; // switching tabs refreshes, but not within 10 s of the last refresh
const PLAYER_CACHE_MS = 24 * 3600_000;

// ---------- storage (chrome.storage when running as an extension, localStorage otherwise) ----------
const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage?.local;
const store = {
  async get(key) {
    if (hasChromeStorage) return (await chrome.storage.local.get(key))[key];
    try { return JSON.parse(localStorage.getItem(key)); } catch { return undefined; }
  },
  async set(key, value) {
    if (hasChromeStorage) return chrome.storage.local.set({ [key]: value });
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

// ---------- tiny DOM helper ----------
const $ = (sel) => document.querySelector(sel);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

// ---------- data loading ----------
let projCache = null; // { key, map } — projections are big-ish, keep them for the life of the popup

async function getState() {
  const s = await getJSON(`${SLEEPER}/state/nfl`);
  return {
    season: s.league_season || s.season,
    seasonType: s.season_type === 'post' ? 'post' : 'regular',
    week: Math.max(1, Number(s.display_week || s.week || 1)),
  };
}

async function getProjections(season, week, seasonType) {
  const key = `${season}-${week}-${seasonType}`;
  if (projCache?.key === key) return projCache.map;
  const arr = await getJSON(`${PROJ}/${season}/${week}?season_type=${seasonType}&${POS_QS}`);
  const map = {};
  for (const p of arr || []) map[p.player_id] = p;
  projCache = { key, map };
  return map;
}

// Full player list — the only place Sleeper has jersey numbers (also the name/team fallback for
// starters with no projection row). It's ~15 MB, so we keep a slim copy and refetch once a day.
async function getPlayerDump() {
  const cached = await store.get('playerDump3');
  if (cached && Date.now() - cached.t < PLAYER_CACHE_MS) return cached.map;
  const all = await getJSON(`${SLEEPER}/players/nfl`);
  const map = {};
  for (const [id, p] of Object.entries(all)) {
    map[id] = [p.first_name || '', p.last_name || '', p.position || '', p.team || null, p.injury_status || null,
      p.number ?? null, p.espn_id ?? null];
  }
  await store.set('playerDump3', { t: Date.now(), map });
  return map;
}

// Season-to-date PPR position ranks (e.g. RB2), straight from Sleeper's season stats.
let rankCache = null;
async function getSeasonRanks(season, seasonType) {
  const key = `${season}-${seasonType}`;
  if (rankCache?.key === key && Date.now() - rankCache.t < 10 * 60_000) return rankCache.map;
  const arr = await getJSON(`${STATS}/${season}?season_type=${seasonType}&${POS_QS}`);
  const map = {};
  for (const r of arr || []) {
    const rank = r.stats?.pos_rank_ppr;
    if (rank && rank < 999) map[r.player_id] = rank; // 999 = unranked (mostly K/DEF)
  }
  rankCache = { key, t: Date.now(), map };
  return map;
}

// This week's stats per player (pid → stats). Sleeper's servers keep this only a few seconds, while
// league matchups can be minutes behind, so live scores are worked out from it (see liveScores).
async function getWeekStats(season, week, seasonType) {
  const arr = await getJSON(`${STATS}/${season}/${week}?season_type=${seasonType}&${POS_QS}`);
  const map = new Map();
  for (const r of arr || []) if (r.stats) map.set(String(r.player_id), r.stats);
  return map;
}

// Sleeper's schedule — its own game ids, which the plays feed is keyed by.
let scheduleCache = null;
async function getSleeperSchedule(season, seasonType) {
  const key = `${season}-${seasonType}`;
  if (scheduleCache?.key === key) return scheduleCache.list;
  const list = await getJSON(`https://api.sleeper.com/schedule/nfl/${seasonType}/${season}`);
  scheduleCache = { key, list: list || [] };
  return scheduleCache.list;
}

// Plays with each player's stats on the play — the feed behind Sleeper's Game Center "Plays" tab.
// Unofficial, but open (no login). Play stats × a league's scoring = that play's fantasy points, the
// same way Sleeper shows "+6.5". By game it returns the last 20 plays; by week, every play so far.
async function queryPlays(season, seasonType, args) {
  const query = `query plays { plays(sport: "nfl", season_type: "${seasonType}", season: "${season}", ${args}) { play_id game_id metadata play_stats { stats player } } }`;
  const res = await fetch('https://sleeper.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName: 'plays', variables: {}, query }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} from sleeper.com`);
  return (await res.json()).data?.plays || [];
}
const getGamePlays = (season, seasonType, gameId) => queryPlays(season, seasonType, `game_id: "${gameId}"`);
const getWeekPlays = (season, seasonType, week) => queryPlays(season, seasonType, `week: ${Number(week)}`);

// ---------- ESPN leagues (public leagues; ESPN's own fantasy API, unofficial) ----------
// This week's matchups with lineups, live points, projections and win probability, plus teams,
// owners and scoring. The filter header trims the schedule to just this week's matchup period.
async function getEspnLeague(id, season, week, period = week) {
  const url = `${ESPN_FANTASY}/${season}/segments/0/leagues/${id}?view=mMatchupScore&view=mBoxscore&view=mTeam&view=mSettings&scoringPeriodId=${Number(week)}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'x-fantasy-filter': JSON.stringify({ schedule: { filterMatchupPeriodIds: { value: [Number(period)] } } }) },
  });
  if (res.status === 401 || res.status === 403) throw new Error('This ESPN league is private');
  if (!res.ok) throw new Error(`${res.status} from ESPN`);
  return res.json();
}

// League name + teams (with owners) for the Settings team picker, and which weeks each matchup covers.
const espnMetaCache = {};
async function getEspnMeta(id, season) {
  if (espnMetaCache[id]) return espnMetaCache[id];
  season ||= current?.state.season || (await getState()).season;
  const res = await fetch(`${ESPN_FANTASY}/${season}/segments/0/leagues/${id}?view=mTeam&view=mSettings`, { cache: 'no-store' });
  if (res.status === 401 || res.status === 403) throw new Error('private');
  if (!res.ok) throw new Error(res.status === 404 ? 'notfound' : `HTTP ${res.status}`);
  const d = await res.json();
  const members = d.members || [];
  return (espnMetaCache[id] = {
    name: d.settings?.name || `ESPN league ${id}`,
    teams: (d.teams || [])
      .map((t) => ({ id: t.id, name: espnTeamName(t), owner: members.find((m) => m.id === t.owners?.[0])?.displayName || '' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    periods: d.settings?.scheduleSettings?.matchupPeriods || {}, // { "15": [15, 16], ... }
  });
}

// ESPN's matchup period for an NFL week: the same number all regular season, but a 2-week playoff
// round puts two weeks under one period (e.g. period 15 = weeks 15 and 16).
async function espnPeriod(id, season, week) {
  const periods = (await getEspnMeta(id, season).catch(() => null))?.periods || {};
  const hit = Object.entries(periods).find(([, weeks]) => weeks.map(Number).includes(Number(week)));
  return hit ? Number(hit[0]) : Number(week);
}

const espnTeamName = (t) => (t?.name || `${t?.location || ''} ${t?.nickname || ''}`).trim() || 'Team';

// ESPN scoring rules → Sleeper-style { stat_key: points } (D/ST values use ESPN's D/ST overrides).
function espnScoring(items = []) {
  const out = {};
  for (const it of items) {
    const keys = ESPN_STAT_KEYS[it.statId];
    if (!keys) continue;
    const isDef = it.statId >= 89 && it.statId < 198;
    const pts = isDef ? (it.pointsOverrides?.['16'] ?? it.points) : it.points;
    for (const k of keys) out[k] = pts;
  }
  return out;
}

// Match an ESPN player to a Sleeper player id: ESPN id when Sleeper has it, else name + team (+ position).
// Team defenses are keyed by team abbreviation in Sleeper, e.g. "PIT".
let espnIndex = null;
const normName = (s) => String(s || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
function sleeperIdFor(p, dump) {
  const team = ESPN_TEAMS[p.proTeamId] || null;
  const pos = ESPN_POS[p.defaultPositionId] || null;
  if (pos === 'DEF') return team;
  if (!dump) return null;
  if (espnIndex?.dump !== dump) {
    const byEspn = {}, byName = {}, byNameTeam = {};
    for (const [id, d] of Object.entries(dump)) {
      if (d[6] != null) byEspn[d[6]] = id;
      if (!d[3]) continue;
      const n = normName(d[0] + ' ' + d[1]);
      byName[`${n}|${d[3]}|${d[2]}`] ??= id;
      byNameTeam[`${n}|${d[3]}`] ??= id;
    }
    espnIndex = { dump, byEspn, byName, byNameTeam };
  }
  const n = normName(p.fullName);
  return espnIndex.byEspn[p.id] || espnIndex.byName[`${n}|${team}|${pos}`] || espnIndex.byNameTeam[`${n}|${team}`] || null;
}

// Shape one ESPN league like a Sleeper one ({ league, me, opp }) so the rest of the app treats them alike.
function espnLeagueData(d, cfg, week, period, dump, extraInfo) {
  const league = {
    league_id: `espn:${cfg.id}`,
    name: d.settings?.name || `ESPN league ${cfg.id}`,
    scoring_settings: espnScoring(d.settings?.scoringSettings?.scoringItems),
    espn: true,
    espnStats: {}, // pid → { applied: { statId: points }, raw: { statId: value } }, for the points breakdown
  };
  const teams = d.teams || [];
  const ownerOf = (t) => (d.members || []).find((mm) => mm.id === t.owners?.[0] || mm.id === t.primaryOwner);
  // Every team in the league, for team nicknames in Settings.
  const teamList = teams
    .map((t) => ({ key: String(t.id), name: espnTeamName(t), user: ownerOf(t)?.displayName || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const team = teams.find((t) => t.id === Number(cfg.teamId));
  if (!team) return { league, teams: teamList, skip: 'Pick your team in Settings ⚙' };
  const m = (d.schedule || []).find((x) => x.matchupPeriodId === period && (x.home?.teamId === team.id || x.away?.teamId === team.id));
  if (!m) return { league, teams: teamList, skip: 'No matchup this week' };
  const mine = m.home?.teamId === team.id ? m.home : m.away;
  const theirs = m.home?.teamId === team.id ? m.away : m.home;
  if (!theirs) return { league, teams: teamList, skip: 'Bye week (no opponent)' };

  // Standings: wins (ties = half) first, then points for. No places until a game is final.
  const rec = (t) => t?.record?.overall || {};
  const anyPlayed = teams.some((t) => (rec(t).wins || 0) + (rec(t).losses || 0) + (rec(t).ties || 0) > 0);
  const ranked = [...teams].sort((a, b) => {
    const A = rec(a), B = rec(b);
    return ((B.wins || 0) + (B.ties || 0) / 2) - ((A.wins || 0) + (A.ties || 0) / 2) || (B.pointsFor || 0) - (A.pointsFor || 0);
  });

  const side = (s) => {
    const t = teams.find((x) => x.id === s.teamId) || {};
    const owner = ownerOf(t);
    const r = rec(t);
    // Starters drive cheer/boo; the whole roster (bench and IR too) is kept for the roster panel.
    const starters = [], players_points = {}, projMap = {}, roster = [];
    for (const e of s.rosterForCurrentScoringPeriod?.entries || []) {
      const p = e.playerPoolEntry?.player;
      if (!p) continue;
      const pos = ESPN_POS[p.defaultPositionId] || '?';
      const nfl = ESPN_TEAMS[p.proTeamId] || null;
      const pid = sleeperIdFor(p, dump) || `espn:${p.id}`;
      extraInfo[pid] ??= { name: shortName(p.firstName, p.lastName, pos, nfl, pid), pos, team: nfl, inj: null, num: null };
      const stat = (src) => (p.stats || []).find((x) => x.scoringPeriodId === Number(week) && x.statSourceId === src && x.statSplitTypeId === 1);
      const bench = ESPN_BENCH_SLOTS.has(e.lineupSlotId);
      if (!bench) starters.push(pid);
      roster.push({ pid, slot: ESPN_SLOTS[e.lineupSlotId] || (bench ? 'BN' : 'FLEX') });
      players_points[pid] = e.playerPoolEntry.appliedStatTotal ?? stat(0)?.appliedTotal ?? 0;
      if (stat(0)) league.espnStats[pid] = { applied: stat(0).appliedStats || {}, raw: stat(0).stats || {} };
      projMap[pid] = stat(1)?.appliedTotal ?? 0;
    }
    roster.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)); // ESPN lists slots in no set order
    return {
      m: { starters, players_points, points: s.totalPointsLive ?? s.totalPoints ?? 0 },
      projMap,
      roster,
      key: t.id != null ? String(t.id) : null, // for team nicknames
      name: espnTeamName(t),
      user: owner?.displayName || '',
      custom: !!owner?.displayName,
      record: `${r.wins || 0}-${r.losses || 0}${r.ties ? `-${r.ties}` : ''}`,
      place: anyPlayed ? ranked.findIndex((x) => x.id === t.id) + 1 : null,
      of: teams.length,
      espnProj: s.totalProjectedPointsLive ?? s.totalProjectedPoints ?? 0,
      espnWin: s.winProbability,
    };
  };
  return { league, teams: teamList, me: side(mine), opp: side(theirs), skip: null, espnFinal: !!m.winner && m.winner !== 'UNDECIDED' };
}

const normTeam = (abbr) => ({ WSH: 'WAS' })[abbr] || abbr;

// ESPN gives "8-9" or "8-8-1"; show W-L, adding ties only when a team has one.
function wlt(competitor) {
  const summary = competitor.records?.find((r) => r.type === 'total')?.summary || '0-0';
  const [w = 0, l = 0, t = 0] = summary.split('-').map((n) => Number(n) || 0);
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

async function getGames(season, week, seasonType) {
  const d = await getJSON(`${ESPN}?week=${week}&seasontype=${seasonType === 'post' ? 3 : 2}&dates=${season}`);
  const byTeam = {};
  for (const e of d.events || []) {
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    // Live games only: who has the ball and whether they're inside the other team's 20.
    const situation = e.status.type.state === 'in' ? comp.situation || {} : {};
    const withBall = comp.competitors.find((c) => c.team.id === situation.possession);
    const g = {
      id: e.id,
      date: new Date(e.date),
      state: e.status.type.state, // pre | in | post
      detail: e.status.type.shortDetail,
      home: normTeam(home.team.abbreviation),
      away: normTeam(away.team.abbreviation),
      homeScore: home.score,
      awayScore: away.score,
      homeName: home.team.displayName,
      awayName: away.team.displayName,
      homeShort: home.team.shortDisplayName || home.team.abbreviation, // e.g. "Rams"
      awayShort: away.team.shortDisplayName || away.team.abbreviation,
      homeRec: wlt(home),
      awayRec: wlt(away),
      period: e.status.period, // quarter (5+ = OT)
      clock: e.status.clock,   // seconds left in the quarter
      network: (comp.broadcasts || []).flatMap((b) => b.names || []).join('/') || comp.broadcast || '', // "CBS", "ESPN/ABC"
      possession: withBall ? normTeam(withBall.team.abbreviation) : null, // null right after a score, at halftime, …
      redZone: !!withBall && !!situation.isRedZone,
    };
    byTeam[g.home] = g;
    byTeam[g.away] = g;
  }
  return byTeam;
}

const teamName = (u) => u?.metadata?.team_name || u?.display_name || 'Unknown team';

async function loadLeague(league, uid, week) {
  const base = `${SLEEPER}/league/${league.league_id}`;
  const [rosters, users, matchups] = await Promise.all([
    getJSON(`${base}/rosters`),
    getJSON(`${base}/users`),
    getJSON(`${base}/matchups/${week}`),
  ]);
  const findUser = (id) => (users || []).find((u) => u.user_id === id);
  // Every team in the league, for team nicknames in Settings.
  const teams = (rosters || [])
    .map((r) => { const u = findUser(r.owner_id); return { key: String(r.roster_id), name: teamName(u), user: u?.display_name || '' }; })
    .sort((a, b) => a.name.localeCompare(b.name));
  const mine = (rosters || []).find((r) => r.owner_id === uid || (r.co_owners || []).includes(uid));
  if (!mine) return { league, teams, skip: 'You don’t have a roster here' };
  const myM = (matchups || []).find((m) => m.roster_id === mine.roster_id);
  if (!myM) return { league, teams, skip: 'No matchup this week' };
  const oppM = myM.matchup_id != null
    ? matchups.find((m) => m.matchup_id === myM.matchup_id && m.roster_id !== myM.roster_id)
    : null;
  const oppRoster = oppM && rosters.find((r) => r.roster_id === oppM.roster_id);

  // Standings: wins (ties = half) first, then points for — Sleeper's default. No places until a game is final.
  const stats = (r) => {
    const s = r?.settings || {};
    return { w: s.wins || 0, l: s.losses || 0, t: s.ties || 0, pf: (s.fpts || 0) + (s.fpts_decimal || 0) / 100 };
  };
  const anyPlayed = rosters.some((r) => { const s = stats(r); return s.w + s.l + s.t > 0; });
  const ranked = [...rosters].sort((a, b) => {
    const A = stats(a), B = stats(b);
    return (B.w + B.t / 2) - (A.w + A.t / 2) || B.pf - A.pf;
  });
  // Every player on a team with his lineup slot, for the roster panel: starters in the league's slot
  // order (an empty slot stays as { pid: null }), then the bench, then IR / taxi.
  const slotsOf = (m, roster) => {
    const positions = league.roster_positions || [];
    const out = (m.starters || []).map((pid, i) => {
      const slot = positions[i] || 'FLEX';
      return { pid: pid && pid !== '0' ? pid : null, slot: SLEEPER_SLOTS[slot] || slot };
    });
    const started = new Set(m.starters || []);
    const reserve = new Set(roster?.reserve || []), taxi = new Set(roster?.taxi || []);
    for (const pid of new Set([...(m.players || []), ...reserve, ...taxi])) {
      if (!started.has(pid)) out.push({ pid, slot: reserve.has(pid) ? 'IR' : taxi.has(pid) ? 'TAXI' : 'BN' });
    }
    return out;
  };
  const side = (m, roster, ownerId) => {
    const u = findUser(ownerId);
    const s = stats(roster);
    return {
      m,
      roster: slotsOf(m, roster),
      key: roster ? String(roster.roster_id) : null, // for team nicknames
      name: teamName(u),
      user: u?.display_name || '',
      custom: !!u?.metadata?.team_name, // has a team name that isn't just the username
      record: `${s.w}-${s.l}${s.t ? `-${s.t}` : ''}`,
      place: roster && anyPlayed ? ranked.findIndex((r) => r.roster_id === roster.roster_id) + 1 : null,
      of: rosters.length,
    };
  };
  return {
    league,
    teams,
    me: side(myM, mine, uid),
    opp: oppM ? side(oppM, oppRoster, oppRoster?.owner_id) : null,
    skip: oppM ? null : 'Bye week (no opponent)',
  };
}

function shortName(first, last, pos, team, pid) {
  if (pos === 'DEF') return `${team || pid} D/ST`;
  return first ? `${first[0]}. ${last}` : last || `Player ${pid}`;
}

function playerInfo(pid, proj, dump, extra) {
  const pr = proj[pid];
  const d = dump?.[pid];
  const num = d?.[5] ?? null; // jersey number (only in the full player list)
  if (pr?.player) {
    const p = pr.player;
    const team = pr.team || p.team;
    return { name: shortName(p.first_name, p.last_name, p.position, team, pid), pos: p.position, team, inj: p.injury_status, num };
  }
  if (d) return { name: shortName(d[0], d[1], d[2], d[3], pid), pos: d[2], team: d[3], inj: d[4], num };
  if (extra?.[pid]) return extra[pid]; // ESPN player we couldn't match to Sleeper
  if (/^[A-Z]{2,3}$/.test(pid)) return { name: `${pid} D/ST`, pos: 'DEF', team: pid, inj: null, num: null };
  return { name: `Player ${pid}`, pos: '?', team: null, inj: null, num: null };
}

async function loadAll(username, weekOverride) {
  const state = await getState();
  const week = weekOverride || state.week;
  // Sleeper is optional — someone with only ESPN leagues leaves the username blank.
  let user = null;
  let leagues = [];
  if (username) {
    user = await getJSON(`${SLEEPER}/user/${encodeURIComponent(username)}`);
    if (!user?.user_id) throw new Error(`Couldn't find a Sleeper user named "${username}".`);
    const allLeagues = (await getJSON(`${SLEEPER}/user/${user.user_id}/leagues/nfl/${state.season}`)) || [];
    leagues = allLeagues.filter((l) => !['pre_draft', 'drafting'].includes(l.status));
  }

  // Season points ranks only mean something once Week 1 is done; until then use the preseason PPR rank.
  const useSeasonRanks = state.week > 1 || state.seasonType === 'post';
  const [proj, games, leagueData, dump, seasonRanks, espnRaw, weekStats] = await Promise.all([
    getProjections(state.season, week, state.seasonType).catch(() => ({})),
    getGames(state.season, week, state.seasonType).catch(() => ({})),
    Promise.all(leagues.map((l) => loadLeague(l, user.user_id, week).catch((e) => ({ league: l, skip: e.message })))),
    getPlayerDump().catch(() => null),
    useSeasonRanks ? getSeasonRanks(state.season, state.seasonType).catch(() => null) : null,
    Promise.all(espnLeagues.map((c) => espnPeriod(c.id, state.season, week)
      .then((period) => getEspnLeague(c.id, state.season, week, period).then((d) => ({ c, d, period })))
      .catch((e) => ({ c, err: e.message })))),
    leagues.length ? getWeekStats(state.season, week, state.seasonType).catch(() => null) : null,
  ]);
  liveScores(leagueData, weekStats, games, proj, dump);

  let ranks = { map: seasonRanks || {}, season: !!seasonRanks };
  if (!seasonRanks) {
    for (const [pid, p] of Object.entries(proj)) {
      const r = p.stats?.pos_adp_dd_ppr;
      if (r && r < 999) ranks.map[pid] = Math.round(r); // 999 = unranked (mostly K/DEF)
    }
  }

  const extraInfo = {}; // names for ESPN players we couldn't match to a Sleeper player
  const espnData = espnRaw.map(({ c, d, period, err }) => (err
    ? { league: { league_id: `espn:${c.id}`, name: espnMetaCache[c.id]?.name || `ESPN league ${c.id}`, espn: true }, skip: err }
    : espnLeagueData(d, c, week, period, dump, extraInfo)));

  const model = buildModel([...leagueData, ...espnData], proj, dump, games, ranks, extraInfo);
  model.weekStats = weekStats; // for the points breakdown (null if it didn't load)
  return { state, week, user, model };
}

// Sleeper leagues: while a player's game is live, score him from this week's stats × the league's
// scoring instead of the matchup's players_points, which Sleeper can serve minutes old. Everyone else
// (game not started or final, no stats row, stats didn't load) keeps Sleeper's own number, so final
// scores always match the Sleeper app. m.live lists who was scored from stats; the team total moves
// by the same amount as its live starters did.
function liveScores(leagueData, stats, games, proj, dump) {
  if (!stats) return;
  for (const ld of leagueData) {
    for (const s of [ld.me, ld.opp]) {
      if (!s?.m) continue;
      const pts = { ...s.m.players_points };
      const starters = new Set(s.m.starters || []);
      const live = new Set();
      let change = 0;
      for (const pid of new Set([...Object.keys(pts), ...starters])) {
        if (!pid || pid === '0') continue;
        const g = games[playerInfo(pid, proj, dump).team];
        if (g?.state !== 'in' || !stats.has(pid)) continue;
        const now = Math.round(leagueProj(stats.get(pid), ld.league.scoring_settings) * 100) / 100;
        if (starters.has(pid)) change += now - (pts[pid] ?? 0);
        pts[pid] = now;
        live.add(pid);
      }
      if (!live.size) continue;
      s.m = { ...s.m, players_points: pts, points: Math.round(((s.m.points || 0) + change) * 100) / 100, live };
    }
  }
}

// Where a player's points came from, for the hover text: 'live' (scored from live stats), 'sleeper'
// (the matchup's own number) or null for ESPN leagues.
const ptsSrc = (ld, m, pid) => (ld.league.espn ? null : m.live?.has(pid) ? 'live' : 'sleeper');
const SRC_NOTES = {
  live: 'from Sleeper’s live stats (the Sleeper app can be a few minutes behind)',
  sleeper: 'Sleeper’s matchup score',
};
const srcNote = (srcs) => {
  const src = srcs.includes('live') ? 'live' : srcs.includes('sleeper') ? 'sleeper' : null;
  return src ? ` · ${SRC_NOTES[src]}` : '';
};

// Hover text for a team's total on a league card (Sleeper leagues only).
const totalNote = (ld, s) => {
  if (ld.league.espn) return null;
  const n = [...(s.m.live || [])].filter((pid) => s.m.starters?.includes(pid)).length;
  return n ? `Includes ${n} live starter${n === 1 ? '' : 's'} scored from Sleeper’s live stats (the Sleeper app can be a few minutes behind)`
    : 'Sleeper’s matchup score';
};

// ---------- the actual "who do I cheer for" logic ----------
// A player's projected fantasy points under this league's scoring: projected stats × scoring values.
// Same math Sleeper uses — reproduces its projected totals exactly, custom bonuses included.
function leagueProj(stats, scoring = {}) {
  let pts = 0;
  for (const [k, v] of Object.entries(stats || {})) {
    if (typeof v === 'number' && typeof scoring[k] === 'number') pts += v * scoring[k];
  }
  return pts;
}

// Sleeper's win-probability formula, ported from its web app so the numbers agree: each team's final
// score is normal with mean = projected total, variance = (projected − current)² / (1 + 10·(1 − current/projected)).
function sleeperWinProb(cur1, proj1, cur2, proj2) {
  const settled = (c, p) => c.toFixed(2) === p.toFixed(2);
  if (settled(cur1, proj1) && settled(cur2, proj2)) return cur1 > cur2 ? 1 : cur1 < cur2 ? 0 : 0.5;
  const variance = (c, p) => {
    if (!(p > 0)) return 0.1;
    const v = (c - p) ** 2 / (1 + 10 * (1 - c / p));
    return v > 0 ? v : 0.1;
  };
  const sd = Math.sqrt(variance(cur1, proj1) + variance(cur2, proj2));
  return Math.min(0.99, Math.max(0.01, normalCdf((proj1 - proj2) / sd)));
}

// Seconds left in a game, counted the way Sleeper does: 3600 before kickoff, 1800 at half,
// 0 when final — and overtime also counts as 0. NaN when there's no game (bye).
function secondsLeft(g) {
  if (!g) return NaN;
  if (g.state === 'pre') return 3600;
  if (g.state === 'post') return 0;
  const period = Number(g.period) || 0;
  if (period > 4) return 0;
  return 900 * (4 - Math.min(period, 4)) + (Number(g.clock) || 0);
}

// Sleeper's in-game projection, ported from its web app: blends the pre-game projection with the
// player's current scoring pace, leaning on the pace more as the clock runs down.
//   cur = points so far, proj = pre-game projection, secs = seconds left in his game
function sleeperLiveProj(cur, proj, secs) {
  const mins = 60;
  const left = secs / (60 * mins);                                   // share of the game remaining
  const pace = cur + (cur / (mins - secs / 60 || 1)) * (secs / mins) * left;
  const ceiling = Math.max(0.2 * left * pace + (0.35 + 0.65 * (1 - left)) * pace + 0.45 * left * pace, cur);
  const base = left >= 1 ? proj : Math.max(proj, cur);
  if (left <= 0 && cur < 0) return cur;
  return base + (1 - left) * (ceiling - base);
}

// Standard normal CDF (Abramowitz–Stegun erf approximation).
function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// Total projected fantasy points riding on a set of players (every league, both sides).
const projStakeOf = (players) => players.reduce((s, p) => s + p.legs.reduce((t, l) => t + l.proj, 0), 0);

function buildModel(leagueData, proj, dump, games, ranks, extraInfo = {}) {
  const players = new Map();
  const leagues = leagueData.map((ld, i) => {
    const defaultColor = LEAGUE_COLORS[i % LEAGUE_COLORS.length];
    return { ...ld, defaultColor, color: leagueColors[ld.league.league_id] || defaultColor };
  });
  // ESPN's scoreboard didn't load: treat games as not started, never as finished.
  const noSchedule = !Object.keys(games).length;

  for (const ld of leagues) {
    if (!ld.me) continue;
    // ESPN sides bring their own projections (ESPN's numbers); Sleeper ones are scored from stats.
    const addSide = (matchup, side, projMap) => {
      const pts = matchup.players_points || {};
      for (const pid of matchup.starters || []) {
        if (!pid || pid === '0') continue; // empty lineup slot
        let pl = players.get(pid);
        if (!pl) players.set(pid, (pl = { pid, legs: [], net: 0, impact: 0 }));
        const pj = projMap ? (projMap[pid] ?? 0) : leagueProj(proj[pid]?.stats, ld.league.scoring_settings);
        pl.legs.push({ ld, side, pts: pts[pid] ?? 0, proj: pj, src: ptsSrc(ld, matchup, pid) });
        pl.net += side;
        pl.impact += side * Math.max(pj, 1); // weight by projection; unprojected guys still count a little
      }
    };
    addSide(ld.me.m, +1, ld.me.projMap);
    if (ld.opp) addSide(ld.opp.m, -1, ld.opp.projMap);
  }

  for (const pl of players.values()) {
    pl.info = playerInfo(pl.pid, proj, dump, extraInfo);
    pl.rank = ranks?.map[pl.pid] ?? null;
    pl.game = games[pl.info.team] || null;
    pl.verdict = pl.net > 0 ? 'cheer' : pl.net < 0 ? 'boo' : 'hedge';
    pl.projShown = Math.max(...pl.legs.map((l) => l.proj));
    pl.ptsShown = Math.max(...pl.legs.map((l) => l.pts));
  }

  // Full rosters for the roster panel: who each player is, his game, and his points and projection
  // under this league's scoring.
  for (const ld of leagues) {
    for (const s of [ld.me, ld.opp]) {
      if (!s?.roster) continue;
      s.roster = s.roster.map(({ pid, slot }) => {
        if (!pid) return { pid, slot };
        const info = playerInfo(pid, proj, dump, extraInfo);
        const pj = s.projMap ? (s.projMap[pid] ?? 0) : leagueProj(proj[pid]?.stats, ld.league.scoring_settings);
        return { pid, slot, info, rank: ranks?.map[pid] ?? null, game: games[info.team] || null, pts: s.m.players_points?.[pid] ?? 0, proj: pj, src: ptsSrc(ld, s.m, pid), lid: ld.league.league_id };
      });
    }
  }

  // Live projected total per side, built exactly like Sleeper's: each starter's in-game projection
  // (or his points so far when that comes out 0/NaN, e.g. a bye), then Sleeper's win formula.
  for (const ld of leagues) {
    if (!ld.me) continue;
    if (ld.league.espn) {
      // ESPN leagues: ESPN's own live projections and win probability, so cards match the ESPN app.
      ld.me.proj = ld.me.espnProj;
      if (!ld.opp) continue;
      ld.opp.proj = ld.opp.espnProj;
      const open = (m) => (m.starters || []).some((pid) => {
        const g = players.get(pid)?.game;
        return noSchedule || (g && g.state !== 'post');
      });
      ld.final = ld.espnFinal || (!open(ld.me.m) && !open(ld.opp.m));
      const [a, b] = [ld.me.m.points, ld.opp.m.points];
      ld.winPct = ld.final ? (a > b ? 1 : a < b ? 0 : 0.5) : (ld.me.espnWin ?? 0.5);
      continue;
    }
    const scoring = ld.league.scoring_settings;
    const project = (m) => {
      let current = 0, total = 0, open = 0;
      for (const pid of m.starters || []) {
        if (!pid || pid === '0') continue;
        const g = players.get(pid)?.game;
        const pts = m.players_points?.[pid] ?? 0;
        current += pts;
        const secs = !g && noSchedule ? 3600 : secondsLeft(g); // no scoreboard → assume not started
        total += sleeperLiveProj(pts, leagueProj(proj[pid]?.stats, scoring), secs) || pts;
        if (noSchedule || (g && g.state !== 'post')) open++;
      }
      return { current, total, open };
    };
    const a = project(ld.me.m);
    ld.me.proj = a.total;
    if (!ld.opp) continue;
    const b = project(ld.opp.m);
    ld.opp.proj = b.total;
    ld.final = a.open === 0 && b.open === 0;
    ld.winPct = sleeperWinProb(a.current, a.total, b.current, b.total);
  }

  // Group by NFL game.
  const gameMap = new Map();
  const noGame = { id: 'none', none: true, players: [] };
  for (const pl of players.values()) {
    const g = pl.game;
    if (!g) { noGame.players.push(pl); continue; }
    if (!gameMap.has(g.id)) gameMap.set(g.id, { ...g, players: [] });
    gameMap.get(g.id).players.push(pl);
  }
  // Include every game this week, even ones with none of your players in them.
  for (const g of new Set(Object.values(games))) {
    if (!gameMap.has(g.id)) gameMap.set(g.id, { ...g, players: [] });
  }
  const stateRank = { in: 0, pre: 1, post: 2 };
  const gameList = [...gameMap.values()].sort((a, b) => stateRank[a.state] - stateRank[b.state] || a.date - b.date);
  for (const g of gameList) {
    g.stake = g.players.reduce((s, p) => s + Math.abs(p.impact), 0);
    g.projStake = projStakeOf(g.players);
  }
  if (noGame.players.length) gameList.push(noGame);

  return { leagues, players: [...players.values()], games: gameList, rankSeason: !!ranks?.season };
}

// ---------- rendering ----------
const fmtPts = (n) => String(+(+n || 0).toFixed(2)); // 31.80 → "31.8", 9.00 → "9", 128.21 → "128.21"
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
// Points and projections, to the hundredth — but only when it isn't 0, so they read like Sleeper's:
// 129.89 → "129.89", 134.02 → "134.02", 134.10 → "134.1", 134.00 → "134.0"
const fmt2 = (n) => (Math.round((+n || 0) * 100) / 100).toFixed(2).replace(/0$/, '');
const initials = (name) => {
  const words = name.replace(/[^\p{L}\p{N}\s&]/gu, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || '?').slice(0, 3).toUpperCase();
};
const kickoff = (d) => d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
// "Sun 1:00 PM · CBS" before kickoff, "Q3 5:12 · CBS" while live; finals drop the network.
const gameWhen = (g) => {
  const t = g.state === 'pre' ? kickoff(g.date) : g.detail;
  return g.network && g.state !== 'post' ? `${t} · ${g.network}` : t;
};
// Whether a player's unit is on the field while his game is live, for the dot by his points: 'field',
// 'redzone', or null (sideline, or ESPN isn't saying who has the ball). No free feed lists who's on the
// field play by play, so it goes by possession: offense (QB/RB/WR/TE/K) is on while his team has the
// ball, a D/ST while the other team does; "red zone" is that team inside the other's 20.
const FIELD_STATES = { field: 'on the field', redzone: 'in the red zone' };
function fieldState(g, info) {
  if (g?.state !== 'in' || !g.possession) return null;
  const hasBall = g.possession === info.team;
  if (info.pos === 'DEF' ? hasBall : !hasBall) return null;
  return g.redZone ? 'redzone' : 'field';
}
// Class and tooltip for a player's points box: dimmed before kickoff, a dot while his unit is on the field.
function ptsBox(g, info, title) {
  const state = fieldState(g, info);
  if (state) return { class: `pl-pts ${state}`, title: `${title} · ${FIELD_STATES[state]}` };
  return { class: `pl-pts ${g && g.state !== 'pre' ? '' : 'pre'}`, title };
}
// A player's game from his side: "@ PIT · Sun 1:00 PM · FOX", or "No game" on a bye.
const gameLine = (g, team) => {
  if (!g) return 'No game';
  const home = g.home === team;
  return `${home ? 'vs' : '@'} ${home ? g.away : g.home} · ${gameWhen(g)}`;
};
const leagueTag = (league) => nicknames[league.league_id] || initials(league.name);
// A league card's title: its tag instead of the name when that Settings option is on and a tag is set.
// Hovering a tag shows the league's real name.
const cardName = (league) => {
  const tag = tagTitles && nicknames[league.league_id];
  return h('span', { class: 'lg-name', title: tag ? league.name : null }, tag || league.name);
};
// Team nicknames from Settings, keyed per league so they stick to a team all season.
const teamNickKey = (ld, key) => `${ld.league.league_id}:${key}`;
const teamLabel = (ld, s) => (s?.key != null && teamNicks[teamNickKey(ld, s.key)]) || s?.name || '';
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
// Red (0%) → yellow → green (100%); lightness comes from the theme so it reads in light and dark.
const winColor = (p) => `hsl(${Math.round(p * 130)} 70% var(--wl))`;

function leagueCard(ld) {
  if (ld.skip && !ld.opp) {
    return h('div', { class: 'lg skip', style: `--lc:${ld.color}` },
      h('div', { class: 'lg-head' }, cardName(ld.league), h('span', null, ld.skip)));
  }
  const me = ld.me, opp = ld.opp;
  const p = ld.winPct ?? 0.5;
  const color = winColor(p);
  const verdict = ld.final
    ? (me.m.points > opp.m.points ? 'Won' : me.m.points < opp.m.points ? 'Lost' : 'Tied')
    : Math.round(p * 100) === 50 ? 'Toss-up' : p > 0.5 ? 'Projected win' : 'Projected loss';
  // A team nickname replaces the name (and username); hovering still shows the real one.
  // Clicking the name opens that team's roster instead of filtering to the league.
  const who = (s, side) => {
    const label = teamLabel(ld, s);
    const nick = label !== s.name;
    const full = s.custom && s.user ? `${s.name} (${s.user})` : s.name;
    const open = (e) => { e.preventDefault(); e.stopPropagation(); openRoster(ld.league.league_id, side); };
    return h('div', {
      class: 'tn ro-open', role: 'button', tabindex: '0',
      title: `${nick ? `${label} · ${full}` : full} — click for the roster`,
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); },
    }, label, !nick && s.custom && s.user ? h('span', { class: 'un' }, ` (${s.user})`) : null);
  };
  const standing = (s) => h('div', { class: 'rec' }, s.record, s.place ? ` · ${ordinal(s.place)} of ${s.of}` : '');
  const id = ld.league.league_id;
  const picked = selectedLeagues.includes(id);
  const toggle = (e) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Shift/Ctrl+click: add or remove this league, keep the others.
      selectedLeagues = picked ? selectedLeagues.filter((x) => x !== id) : [...selectedLeagues, id];
    } else {
      // Plain click: just this league — or back to all if it's already the only one.
      selectedLeagues = picked && selectedLeagues.length === 1 ? [] : [id];
    }
    store.set('leagues', selectedLeagues);
    render();
  };
  const title = picked && selectedLeagues.length === 1 ? 'Click to show all leagues again · Shift+click another league to add it'
    : picked ? 'Click to show only this league · Shift+click to remove it'
    : 'Click to show only this league · Shift+click to add it';
  return h('div', {
    class: `lg clickable ${picked ? 'sel' : selectedLeagues.length ? 'dim' : ''}`,
    style: `--lc:${ld.color}`,
    role: 'button',
    tabindex: '0',
    title,
    onmousedown: (e) => { if (e.shiftKey) e.preventDefault(); }, // no text highlighting on shift+click
    onclick: toggle,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } },
  },
    h('div', { class: 'lg-head' },
      cardName(ld.league),
      h('span', { class: 'wl', style: `color:${color}` }, verdict)),
    h('div', { class: 'lg-score' },
      h('div', { class: 'side' },
        who(me, 'me'), standing(me),
        h('span', { class: 'pts', style: `color:${color}`, title: totalNote(ld, me) }, fmtPts(me.m.points)), ' ',
        h('span', { class: 'pj' }, `proj ${fmt2(me.proj)}`)),
      h('div', { class: 'mid' },
        h('span', { class: 'vs' }, 'vs'),
        h('span', { class: 'pct', style: `color:${color}`, title: 'Your estimated chance to win' }, `${Math.round(p * 100)}%`)),
      h('div', { class: 'side r' },
        who(opp, 'opp'), standing(opp),
        h('span', { class: 'pj' }, `proj ${fmt2(opp.proj)}`), ' ',
        h('span', { class: 'pts', style: `color:${winColor(1 - p)}`, title: totalNote(ld, opp) }, fmtPts(opp.m.points)))), // their side of the odds
    h('div', { class: 'bar', title: `Win chance ${Math.round(p * 100)}%` }, h('i', { style: `width:${(p * 100).toFixed(1)}%` })),
    toPlayLine(ld));
}

// "2 RB, 1 WR, 1 K": a team's starters whose games haven't kicked off yet, counted by position
// (QB, RB, WR, TE, K, D/ST, then anything else). Bench and empty lineup slots don't count.
function stillToPlay(side) {
  const counts = {};
  for (const r of side?.roster || []) {
    if (!r.pid || BENCH_SLOTS.includes(r.slot) || r.game?.state !== 'pre') continue;
    counts[r.info.pos] = (counts[r.info.pos] || 0) + 1;
  }
  const rank = (pos) => (POS_ORDER.includes(pos) ? POS_ORDER.indexOf(pos) : POS_ORDER.length);
  return Object.entries(counts)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([pos, n]) => `${n} ${pos === 'DEF' ? 'D/ST' : pos}`)
    .join(', ');
}

// Under the win bar: each side's starters still to play. Players drop off as their games kick off,
// and the line goes once nobody's left on either side.
function toPlayLine(ld) {
  if (!current?.model.games.some((g) => !g.none)) return null; // no schedule loaded: can't tell who has played
  const mine = stillToPlay(ld.me), theirs = stillToPlay(ld.opp);
  if (!mine && !theirs) return null;
  return h('div', { class: 'to-play', title: 'Starters whose games haven’t kicked off yet' },
    h('span', null, mine || '—'),
    h('span', { class: 'to-play-label' }, 'still to play'),
    h('span', { class: 'r' }, theirs || '—'));
}

function injBadge(inj) {
  if (!inj) return null;
  const code = { Questionable: 'Q', Doubtful: 'D', Out: 'O', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }[inj] || inj.slice(0, 3).toUpperCase();
  return h('span', { class: `inj ${code === 'Q' ? 'q' : ''}`, title: inj }, code);
}

// A league's tag chip for one leg of a player: + if he's your starter there, − if your opponent's.
const legChip = (leg, extra = '') => h('span', {
  class: `chip ${leg.side > 0 ? 'for' : 'against'}`,
  style: `--lc:${leg.ld.color}`,
  title: `${leg.side > 0 ? 'Your starter' : `Started by ${teamLabel(leg.ld, leg.ld.opp)}`} in ${leg.ld.league.name}${extra}`,
}, leagueTag(leg.ld.league));

function playerRow(pl, { showGame = false } = {}) {
  const g = pl.game;
  const box = ptsBox(g, pl.info, `Live fantasy points${srcNote(pl.legs.map((l) => l.src))}`);
  const chips = pl.legs.map((l) => legChip(l));
  const gameText = showGame ? gameLine(g, pl.info.team) : null;
  return h('div', { class: 'pl bd-open', ...breakdownHandlers(pl.pid, pl.legs.map((l) => l.ld.league.league_id)) },
    h('div', { class: 'pl-main' },
      h('div', { class: 'pl-name' },
        pl.info.name,
        pl.info.num != null && pl.info.num !== '' ? h('span', { class: 'num' }, ` #${pl.info.num}`) : null),
      h('div', { class: 'pl-meta' },
        h('span', { title: rankTitle(pl) }, `${pl.info.pos}${pl.rank || ''}${pl.info.team ? ' · ' + pl.info.team : ''}`),
        injBadge(pl.info.inj), chips,
        gameText && h('span', null, gameText))),
    h('div', { class: box.class },
      h('span', { class: 'v', title: box.title }, fmt2(pl.ptsShown)),
      lastPlays.has(pl.pid) ? gainTag(pl, lastPlays.get(pl.pid)) : null,
      h('span', { class: 'p' }, `proj ${fmt2(pl.projShown)}`)));
}

// His latest scoring play beside his points ("+6.5"): green when it helped you, red when it hurt,
// plain for coin-flip players. Hover for what happened.
function gainTag(pl, { pts, play }) {
  const helped = pl.verdict === 'cheer' ? pts > 0 : pl.verdict === 'boo' ? pts < 0 : null;
  const when = playWhen(play);
  return h('span', {
    class: `gain ${helped == null ? '' : helped ? 'good' : 'bad'}`,
    title: `Latest scoring play${when ? ` (${when})` : ''}: ${play.desc}`,
  }, signed(pts));
}

const rankTitle = (pl) => {
  if (!pl.rank) return null;
  const tag = `${pl.info.pos}${pl.rank}`;
  return current?.model.rankSeason
    ? `${tag} in PPR points this season`
    : `${tag} preseason PPR rank — switches to season points rank after Week 1`;
};

// Points so far once a player's game has kicked off, his projection before then; highest first.
const sortPts = (p) => (p.game && p.game.state !== 'pre' ? p.ptsShown : p.projShown);
const byPointsDesc = (a, b) => sortPts(b) - sortPts(a) || b.projShown - a.projShown || Math.abs(b.impact) - Math.abs(a.impact);
// By player's other order: QB, RB, WR, TE, K, D/ST (anything else after), highest points first within each.
const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const posRank = (p) => (POS_ORDER.includes(p.info.pos) ? POS_ORDER.indexOf(p.info.pos) : POS_ORDER.length);
const byPositionThenPoints = (a, b) => posRank(a) - posRank(b) || byPointsDesc(a, b);

const splitSides = (players) => ({
  cheer: players.filter((p) => p.verdict === 'cheer').sort(byPointsDesc),
  boo: players.filter((p) => p.verdict === 'boo').sort(byPointsDesc),
  hedge: players.filter((p) => p.verdict === 'hedge').sort(byPointsDesc),
});

// Cheer / root-against columns (+ a full-width "coin flip" row when needed), from splitSides().
function sideColumns({ cheer, boo, hedge }, { hideEmpty = false } = {}) {
  const col = (cls, label, list) => h('div', { class: `col ${cls}` },
    h('h4', null, label),
    list.length ? list.map((p) => playerRow(p)) : h('div', { class: 'empty' }, 'Nobody'));
  const main = hideEmpty
    ? [cheer.length && col('cheer', '▲ Cheer for', cheer), boo.length && col('boo', '▼ Root against', boo)].filter(Boolean)
    : [col('cheer', '▲ Cheer for', cheer), col('boo', '▼ Root against', boo)];
  return h('div', { class: `cols ${main.length === 1 ? 'one' : ''}` },
    main,
    hedge.length ? col('hedge span', '↔ Coin flip', hedge) : null);
}

function tally({ cheer, boo, hedge }) {
  return h('div', { class: 'tally' },
    cheer.length ? h('span', { class: 'c' }, `${cheer.length} for`) : null,
    boo.length ? h('span', { class: 'b' }, `${boo.length} against`) : null,
    hedge.length ? h('span', { class: 'h' }, `${hedge.length} coin flip`) : null);
}

const emptyFiltered = (msg = 'No games match this filter right now.') => h('div', { class: 'status' }, msg);
const noPlayersBadge = () => h('span', { class: 'verdict q' }, 'No players to watch');

function gameCard(g) {
  let title, status;
  if (g.none) {
    title = h('span', { class: 'matchup' }, 'Bye / no game found');
    status = h('span', { class: 'gstat' }, '');
  } else {
    const showScore = g.state !== 'pre';
    // e.g. "49ers (1-0) 14 @ Rams (0-1) 10"
    const teamBit = (short, rec, score) => h('span', { class: 'tm' },
      short, h('span', { class: 'trec' }, ` (${rec})`), showScore && h('span', { class: 'sc' }, ` ${score}`));
    title = h('span', { class: 'matchup' },
      teamBit(g.awayShort || g.away, g.awayRec, g.awayScore), ' @ ',
      teamBit(g.homeShort || g.home, g.homeRec, g.homeScore));
    status = h('span', { class: `gstat ${g.state === 'in' ? 'live' : ''}` }, gameWhen(g));
  }

  if (!g.players.length) {
    return h('div', { class: `game quiet ${g.state || ''}` },
      h('div', { class: 'g-head' }, h('div', null, title, h('div', null, status)), noPlayersBadge()));
  }
  const sides = splitSides(g.players);
  return h('div', { class: `game ${g.state || ''}` },
    h('div', { class: 'g-head' }, h('div', null, title, h('div', null, status)), tally(sides)),
    sideColumns(sides));
}

function renderGames(model) {
  const games = model.games.filter(matchesFilter);
  return games.length ? h('div', { class: 'games' }, games.map(gameCard)) : emptyFiltered();
}

function teamCard(t) {
  const g = t.game;
  const isHome = g && g.home === t.team;
  let line = t.team === 'FA' ? 'Free agents' : 'Bye week';
  if (g) {
    const opp = isHome ? g.away : g.home;
    const score = g.state !== 'pre' ? ` · ${isHome ? g.homeScore : g.awayScore}–${isHome ? g.awayScore : g.homeScore}` : '';
    line = `${isHome ? 'vs' : '@'} ${opp}${score} · ${gameWhen(g)}`;
  }
  const fullName = TEAM_NAMES[t.team] || (g && (isHome ? g.homeName : g.awayName));
  const hasPlayers = t.players.length > 0;
  const [cls, label] = !hasPlayers ? [null, null]
    : t.net > 0.5 ? ['c', `▲ Pull for ${t.team}`]
    : t.net < -0.5 ? ['b', `▼ Root against ${t.team}`]
    : ['h', '↔ Mixed'];
  return h('div', { class: `game ${g?.state || ''} ${hasPlayers ? '' : 'quiet'}` },
    h('div', { class: 'g-head' },
      h('div', null,
        h('span', { class: 'matchup' }, t.team),
        fullName && h('span', { class: 'fullname' }, ` ${fullName}${g ? ` (${isHome ? g.homeRec : g.awayRec})` : ''}`),
        h('div', null, h('span', { class: `gstat ${g?.state === 'in' ? 'live' : ''}` }, line))),
      hasPlayers
        ? h('span', { class: `verdict ${cls}`, title: 'Based on projected points at stake for and against you' }, label)
        : noPlayersBadge()),
    hasPlayers ? sideColumns(splitSides(t.players), { hideEmpty: true }) : null);
}

function renderTeams(model) {
  const realGames = model.games.filter((g) => !g.none);
  const gameOrder = new Map(realGames.map((g, i) => [g.id, i]));
  const blank = (team) => ({ team, game: null, players: [], net: 0, stake: 0 });
  // Start with all 32 teams so bye teams and teams without your players still show up.
  const teams = new Map(Object.keys(TEAM_NAMES).map((abbr) => [abbr, blank(abbr)]));
  for (const g of realGames) {
    for (const abbr of [g.away, g.home]) {
      if (!teams.has(abbr)) teams.set(abbr, blank(abbr));
      teams.get(abbr).game = g;
    }
  }
  for (const pl of model.players) {
    const key = pl.info.team || 'FA';
    if (!teams.has(key)) teams.set(key, blank(key));
    const t = teams.get(key);
    t.players.push(pl);
    t.net += pl.impact;
    t.stake += Math.abs(pl.impact);
  }
  // Teams with your players first, then the no-players-to-watch ones. Within each group: same order as
  // the game list (live → upcoming → final, byes last), biggest stake first within a game.
  const list = [...teams.values()]
    .filter((t) => matchesFilter(t.game) && (!model.leagueScoped || t.players.length))
    .sort((a, b) => (b.players.length > 0) - (a.players.length > 0)
      || (gameOrder.get(a.game?.id) ?? 1e9) - (gameOrder.get(b.game?.id) ?? 1e9)
      || b.stake - a.stake || a.team.localeCompare(b.team));
  return list.length ? h('div', { class: 'games' }, list.map(teamCard)) : emptyFiltered();
}

function renderPlayers(model) {
  const list = (cls, label, players, hint) => h('div', { class: `plist ${cls}` },
    h('h3', null, label, ' ', h('span', { class: 'pj' }, hint)),
    players.length ? players.map((p) => playerRow(p, { showGame: true })) : h('div', { class: 'empty' }, 'Nobody'));
  const P = model.players.filter((p) => matchesFilter(p.game));
  if (!P.length) return emptyFiltered('None of your players play in this time window.');
  const { cheer, boo, hedge } = splitSides(P);
  if (playerSort === 'position') [cheer, boo, hedge].forEach((players) => players.sort(byPositionThenPoints));
  const sortButton = (key, label) => h('button', {
    type: 'button', class: playerSort === key ? 'on' : '', 'aria-pressed': String(playerSort === key),
    onclick: () => { playerSort = key; store.set('playerSort', key); render(); },
  }, label);
  return h('div', null,
    h('div', { class: 'psort' }, h('span', null, 'Sort'), sortButton('points', 'Points'), sortButton('position', 'Position')),
    h('div', { class: 'pcols' },
      list('cheer', '▲ Cheer for', cheer, `(${cheer.length})`),
      list('boo', '▼ Root against', boo, `(${boo.length})`),
      hedge.length ? list('hedge', '↔ Coin flip', hedge, '(on your team in one league, opponent’s in another)') : null));
}

function renderMustWatch(model) {
  const el = $('#mustwatch');
  const candidates = model.games.filter((g) => !g.none && g.state !== 'post' && matchesFilter(g));
  // Biggest unfinished game = most projected fantasy points riding on it (yours + opponents', every league).
  const top = candidates.sort((a, b) => b.projStake - a.projStake)[0];
  if (!top || !top.players.length) { el.hidden = true; return; }
  const c = top.players.filter((p) => p.verdict === 'cheer').length;
  const b = top.players.filter((p) => p.verdict === 'boo').length;
  el.replaceChildren(
    h('b', null, top.state === 'in' ? '🔴 Watch now: ' : '🔥 Must-watch: '),
    `${top.away} @ ${top.home}`,
    h('span', { class: 'pj' }, ` — ${fmt1(top.projStake)} proj pts in play · ${c} to cheer, ${b} to boo · ${gameWhen(top)}`));
  el.hidden = false;
}

// ---------- roster panel ----------
let rosterOpen = null; // { leagueId, side: 'me' | 'opp' } while a team's roster is showing

function openRoster(leagueId, side) {
  rosterOpen = { leagueId, side };
  renderRoster();
}

function closeRoster() {
  rosterOpen = null;
  $('#roster').hidden = true;
}

// One roster spot: lineup slot, player, his game, points and projection in that league.
function rosterRow(r) {
  if (!r.pid) {
    return h('div', { class: 'pl ro-row' }, h('span', { class: 'ro-slot' }, r.slot), h('div', { class: 'pl-main empty' }, 'Empty'));
  }
  const g = r.game;
  const box = ptsBox(g, r.info, `Fantasy points${srcNote([r.src])}`);
  return h('div', { class: 'pl ro-row bd-open', ...breakdownHandlers(r.pid, [r.lid]) },
    h('span', { class: 'ro-slot' }, r.slot),
    h('div', { class: 'pl-main' },
      h('div', { class: 'pl-name' },
        r.info.name,
        r.info.num != null && r.info.num !== '' ? h('span', { class: 'num' }, ` #${r.info.num}`) : null),
      h('div', { class: 'pl-meta' },
        h('span', null, `${r.info.pos}${r.rank || ''}${r.info.team ? ' · ' + r.info.team : ''}`),
        injBadge(r.info.inj),
        h('span', null, gameLine(g, r.info.team)))),
    h('div', { class: box.class },
      h('span', { class: 'v', title: box.title }, fmt2(r.pts)),
      h('span', { class: 'p' }, `proj ${fmt2(r.proj)}`)));
}

// The roster of the team clicked on a league card. Redrawn on every refresh while it's open.
function renderRoster() {
  const el = $('#roster');
  const ld = rosterOpen && current?.model.leagues.find((x) => x.league.league_id === rosterOpen.leagueId);
  const s = ld?.[rosterOpen.side];
  if (!s?.roster) return closeRoster();
  const label = teamLabel(ld, s);
  const starters = s.roster.filter((r) => !['BN', 'IR', 'TAXI'].includes(r.slot));
  const bench = s.roster.filter((r) => r.slot === 'BN');
  const reserve = s.roster.filter((r) => r.slot === 'IR' || r.slot === 'TAXI');
  // Titled by what's there, since most leagues have no taxi squad.
  const reserveTitle = [reserve.some((r) => r.slot === 'IR') && 'IR', reserve.some((r) => r.slot === 'TAXI') && 'Taxi']
    .filter(Boolean).join(' / ');
  const total = (list, key) => list.reduce((t, r) => t + (r[key] || 0), 0);
  const section = (title, list, note) => list.length
    ? h('div', { class: 'ro-sec' }, h('h4', null, title, note ? h('span', { class: 'ro-note' }, note) : null), list.map(rosterRow))
    : null;
  el.replaceChildren(
    h('div', { class: 'ro-backdrop', onclick: closeRoster }),
    h('div', { class: 'ro-panel', role: 'dialog', 'aria-label': `${label} roster`, style: `--lc:${ld.color}` },
      h('div', { class: 'ro-head' },
        h('div', { class: 'ro-title' },
          h('div', { class: 'ro-team' }, label, s.user && s.user !== label ? h('span', { class: 'un' }, ` (${s.user})`) : null),
          h('div', { class: 'ro-sub' }, [ld.league.name, s.record, s.place ? `${ordinal(s.place)} of ${s.of}` : null].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'ghost x', title: 'Close (Esc)', onclick: closeRoster }, '✕')),
      h('div', { class: 'ro-sum' }, `${fmtPts(s.m.points)} pts · proj ${fmt2(s.proj)}`),
      section('Starters', starters),
      section('Bench', bench, `${fmt2(total(bench, 'pts'))} pts`),
      section(reserveTitle, reserve)));
  el.hidden = false;
}

// ---------- points breakdown ----------
// Click a player: what his points came from in each league he's in (catches, yards, TDs…), scored
// with that league's rules. Sleeper leagues use this week's stats; ESPN leagues use ESPN's own split.
let breakdownOpen = null; // { pid, leagueIds } while a breakdown is showing

const STAT_LABELS = {
  pass_yd: 'Passing yards', pass_td: 'Passing TDs', pass_2pt: 'Passing 2-pt', pass_int: 'Interceptions thrown',
  pass_int_td: 'Pick-sixes thrown', pass_cmp: 'Completions', pass_inc: 'Incompletions', pass_att: 'Pass attempts',
  pass_cmp_40p: '40+ yd completions', pass_fd: 'Passing first downs', pass_sack: 'Times sacked',
  pass_td_40p: '40+ yd passing TDs', pass_td_50p: '50+ yd passing TDs',
  bonus_pass_yd_300: '300+ passing yards bonus', bonus_pass_yd_400: '400+ passing yards bonus',
  rush_yd: 'Rushing yards', rush_td: 'Rushing TDs', rush_2pt: 'Rushing 2-pt', rush_att: 'Rush attempts',
  rush_fd: 'Rushing first downs', rush_40p: '40+ yd rushes', rush_td_40p: '40+ yd rushing TDs', rush_td_50p: '50+ yd rushing TDs',
  bonus_rush_yd_100: '100+ rushing yards bonus', bonus_rush_yd_200: '200+ rushing yards bonus',
  rec: 'Receptions', rec_yd: 'Receiving yards', rec_td: 'Receiving TDs', rec_2pt: 'Receiving 2-pt', rec_tgt: 'Targets',
  rec_fd: 'Receiving first downs', rec_0_4: '0–4 yd catches', rec_5_9: '5–9 yd catches', rec_10_19: '10–19 yd catches',
  rec_20_29: '20–29 yd catches', rec_30_39: '30–39 yd catches', rec_40p: '40+ yd catches',
  rec_td_40p: '40+ yd receiving TDs', rec_td_50p: '50+ yd receiving TDs',
  bonus_rec_yd_100: '100+ receiving yards bonus', bonus_rec_yd_200: '200+ receiving yards bonus',
  bonus_rec_te: 'TE reception bonus', bonus_rec_rb: 'RB reception bonus', bonus_rec_wr: 'WR reception bonus',
  fum: 'Fumbles', fum_lost: 'Fumbles lost', fum_rec_td: 'Fumble recovery TDs',
  kr_yd: 'Kick return yards', pr_yd: 'Punt return yards', st_td: 'Special teams TDs',
  st_ff: 'Special teams forced fumbles', st_fum_rec: 'Special teams fumble recoveries',
  fgm: 'Field goals made', fgm_yds: 'Field goal yards', fgm_0_19: 'FGs made (0–19 yd)', fgm_20_29: 'FGs made (20–29 yd)',
  fgm_30_39: 'FGs made (30–39 yd)', fgm_40_49: 'FGs made (40–49 yd)', fgm_50_59: 'FGs made (50–59 yd)',
  fgm_50p: 'FGs made (50+ yd)', fgm_60p: 'FGs made (60+ yd)', fgmiss: 'Missed FGs', fgmiss_0_19: 'Missed FGs (0–19 yd)',
  fgmiss_20_29: 'Missed FGs (20–29 yd)', fgmiss_30_39: 'Missed FGs (30–39 yd)', fgmiss_40_49: 'Missed FGs (40–49 yd)',
  fgmiss_50p: 'Missed FGs (50+ yd)', xpm: 'Extra points', xpmiss: 'Missed extra points',
  sack: 'Sacks', int: 'Interceptions', fum_rec: 'Fumble recoveries', ff: 'Forced fumbles', def_td: 'Defensive TDs',
  def_st_td: 'Special teams TDs', def_st_ff: 'Special teams forced fumbles', def_st_fum_rec: 'Special teams fumble recoveries',
  safe: 'Safeties', blk_kick: 'Blocked kicks', blk_kick_ret_yd: 'Blocked kick return yards', def_2pt: 'Defensive 2-pt returns',
  int_ret_yd: 'Interception return yards', fum_ret_yd: 'Fumble return yards', fg_ret_yd: 'Missed FG return yards',
  def_kr_yd: 'Kick return yards', def_pr_yd: 'Punt return yards', def_3_and_out: 'Three-and-outs',
  def_4_and_stop: '4th-down stops', def_pass_def: 'Passes defended', qb_hit: 'QB hits', tkl: 'Tackles',
  tkl_solo: 'Solo tackles', tkl_ast: 'Assisted tackles', tkl_loss: 'Tackles for loss', sack_yd: 'Sack yards',
};
// ESPN stat ids → labels (D/ST tiers included). Anything missing shows as "ESPN stat N".
const ESPN_STAT_LABELS = {
  3: 'Passing yards', 4: 'Passing TDs', 19: 'Passing 2-pt', 20: 'Interceptions thrown',
  24: 'Rushing yards', 25: 'Rushing TDs', 26: 'Rushing 2-pt',
  42: 'Receiving yards', 43: 'Receiving TDs', 44: 'Receiving 2-pt', 53: 'Receptions',
  63: 'Fumble recovery TDs', 72: 'Fumbles lost',
  74: 'FGs made (50+ yd)', 77: 'FGs made (40–49 yd)', 80: 'FGs made (0–39 yd)', 85: 'Missed FGs',
  86: 'Extra points', 88: 'Missed extra points', 198: 'FGs made (50–59 yd)', 201: 'FGs made (60+ yd)',
  89: '0 points allowed', 90: '1–6 points allowed', 91: '7–13 points allowed', 92: '14–17 points allowed',
  93: 'Blocked kick return TDs', 94: 'Defensive TDs', 95: 'Interceptions', 96: 'Fumble recoveries',
  97: 'Blocked kicks', 98: 'Safeties', 99: 'Sacks', 101: 'Kick return TDs', 102: 'Punt return TDs',
  103: 'Interception return TDs', 104: 'Fumble return TDs',
  121: '18–21 points allowed', 122: '22–27 points allowed', 123: '28–34 points allowed',
  124: '35–45 points allowed', 125: '46+ points allowed',
  127: 'Under 100 yards allowed', 128: 'Under 100 yards allowed', 129: '100–199 yards allowed',
  130: '200–299 yards allowed', 131: '300–349 yards allowed', 132: '350–399 yards allowed',
  133: '400–449 yards allowed', 134: '450–499 yards allowed', 135: '500–549 yards allowed', 136: '550+ yards allowed',
  206: '2-pt returns', 209: '1-pt safeties',
};
const ESPN_YARD_STATS = new Set([3, 24, 42]);
const isEspnTier = (id) => (id >= 89 && id <= 92) || (id >= 121 && id <= 136); // points / yards allowed

// "pts_allow_28_34" → "28–34 points allowed"; anything else unknown → "Pass cmp 40p"-style words.
function statLabel(key) {
  if (STAT_LABELS[key]) return STAT_LABELS[key];
  const tier = key.match(/^(pts|yds)_allow_(\d+)(?:_(\d+)|p)$/);
  if (tier) return `${tier[3] ? `${tier[2]}–${tier[3]}` : `${tier[2]}+`} ${tier[1] === 'pts' ? 'points' : 'yards'} allowed`;
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
// Tiers and bonuses are yes/no (1), so they don't show a count.
const isTierStat = (key) => /^(bonus_|pts_allow_|yds_allow_)/.test(key);

// One league's lines for a player: [{ label, count, pts }], biggest points first. null = no stats to split.
function breakdownLines(ld, pid, model) {
  if (ld.league.espn) {
    const s = ld.league.espnStats?.[pid];
    if (!s) return null;
    return Object.entries(s.applied)
      .filter(([, pts]) => pts)
      .map(([id, pts]) => ({
        label: ESPN_STAT_LABELS[id] || `ESPN stat ${id}`,
        count: isEspnTier(id) || s.raw[id] == null ? null : `${s.raw[id]}${ESPN_YARD_STATS.has(Number(id)) ? ' yd' : ''}`,
        pts,
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  }
  const stats = model.weekStats?.get(pid);
  if (!stats) return null;
  const scoring = ld.league.scoring_settings || {};
  const lines = [];
  for (const [k, v] of Object.entries(stats)) {
    const per = scoring[k];
    if (typeof v !== 'number' || typeof per !== 'number' || !(v * per)) continue;
    let label = statLabel(k);
    if (k.startsWith('pts_allow_') && stats.pts_allow != null) label += ` (${stats.pts_allow})`;
    if (k.startsWith('yds_allow_') && stats.yds_allow != null) label += ` (${stats.yds_allow})`;
    lines.push({ label, count: isTierStat(k) ? null : `${Math.round(v * 100) / 100}${k.endsWith('_yd') ? ' yd' : ''}`, pts: v * per });
  }
  return lines.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}

function openBreakdown(pid, leagueIds) {
  breakdownOpen = { pid, leagueIds };
  renderBreakdown();
}

function closeBreakdown() {
  breakdownOpen = null;
  $('#breakdown').hidden = true;
}

// Click / Enter on a player row opens his breakdown.
const breakdownHandlers = (pid, leagueIds) => {
  const open = (e) => { e.preventDefault(); e.stopPropagation(); openBreakdown(pid, leagueIds); };
  return {
    role: 'button', tabindex: '0', title: 'Click for his points breakdown',
    onclick: open,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); },
  };
};

// Redrawn on every refresh while it's open, so live points keep moving.
function renderBreakdown() {
  const el = $('#breakdown');
  const model = current?.model;
  if (!breakdownOpen || !model) return closeBreakdown();
  const { pid } = breakdownOpen;
  const leagues = breakdownOpen.leagueIds.map((id) => model.leagues.find((x) => x.league.league_id === id)).filter(Boolean);
  // Find him on either team's roster in each league: which side, slot and points.
  let info = null, game = null;
  const sections = leagues.map((ld) => {
    for (const [side, s] of [['me', ld.me], ['opp', ld.opp]]) {
      const r = s?.roster?.find((x) => x.pid === pid);
      if (!r) continue;
      info ||= r.info;
      game ||= r.game;
      const whose = side === 'me' ? 'Your' : `${teamLabel(ld, s)}’s`;
      const where = BENCH_SLOTS.includes(r.slot) ? `${whose} ${r.slot === 'BN' ? 'bench' : r.slot}` : `${whose} starter`;
      return { ld, where, pts: r.pts, src: r.src, mine: side === 'me' };
    }
    return null;
  }).filter(Boolean);
  if (!sections.length || !info) return closeBreakdown();

  const started = game && game.state !== 'pre';
  const body = sections.map(({ ld, where, pts, src, mine }) => {
    const lines = breakdownLines(ld, pid, model);
    const sum = lines ? Math.round(lines.reduce((t, l) => t + l.pts, 0) * 100) / 100 : null;
    let content;
    if (!lines) {
      content = h('div', { class: 'bd-empty' }, !started ? 'His game hasn’t started yet.'
        : !ld.league.espn && !model.weekStats ? 'Sleeper’s stats didn’t load — try again on the next refresh.'
        : 'No stats for him yet.');
    } else if (!lines.length) {
      content = h('div', { class: 'bd-empty' }, started ? 'Nothing that scores in this league yet.' : 'His game hasn’t started yet.');
    } else {
      content = [
        ...lines.map((l) => h('div', { class: 'bd-row' },
          h('span', { class: 'bd-label' }, l.label, l.count != null ? h('span', { class: 'bd-count' }, ` ${l.count}`) : null),
          h('span', { class: `bd-pts ${l.pts < 0 ? 'neg' : ''}` }, signed(Math.round(l.pts * 100) / 100)))),
        // Sleeper's matchup number for a player whose game is final (or when stats run ahead) can differ briefly.
        Math.abs(sum - pts) > 0.01
          ? h('div', { class: 'bd-note' }, ld.league.espn
            ? `ESPN shows ${fmt2(pts)} in total.`
            : `Sleeper’s matchup score shows ${fmt2(pts)}; it usually catches up to the live stats within a few minutes.`)
          : null,
      ];
    }
    return h('div', { class: 'ro-sec', style: `--lc:${ld.color}` },
      h('h4', { class: 'bd-head' },
        h('span', { class: `chip ${mine ? 'for' : 'against'}`, style: `--lc:${ld.color}` }, leagueTag(ld.league)),
        h('span', { class: 'bd-where' }, `${ld.league.name} · ${where}`),
        h('span', { class: 'ro-note', title: `Fantasy points${srcNote([src])}` }, `${fmt2(pts)} pts`)),
      content);
  });

  el.replaceChildren(
    h('div', { class: 'ro-backdrop', onclick: closeBreakdown }),
    h('div', { class: 'ro-panel bd-panel', role: 'dialog', 'aria-label': `${info.name} points breakdown`, style: `--lc:${sections[0].ld.color}` },
      h('div', { class: 'ro-head' },
        h('div', { class: 'ro-title' },
          h('div', { class: 'ro-team' }, info.name, info.num != null && info.num !== '' ? h('span', { class: 'un' }, ` #${info.num}`) : null),
          h('div', { class: 'ro-sub' }, [`${info.pos}${info.team ? ' · ' + info.team : ''}`, gameLine(game, info.team)].join(' · '))),
        h('button', { type: 'button', class: 'ghost x', title: 'Close (Esc)', onclick: closeBreakdown }, '✕')),
      body));
  el.hidden = false;
}

// ---------- bench ----------
const BENCH_SLOTS = ['BN', 'IR', 'TAXI'];

// Your benched players, one card per league (the leagues picked on the cards, or all of them): points
// once a player's game kicks off, projection before, highest first.
function renderBench(model) {
  const leagues = model.leagues.filter((ld) => ld.me?.roster
    && (!selectedLeagues.length || selectedLeagues.includes(ld.league.league_id)));
  if (!leagues.length) return emptyFiltered('No rosters loaded yet.');
  const sortValue = (r) => (r.game && r.game.state !== 'pre' ? r.pts : r.proj);
  const total = (list, key) => list.reduce((t, r) => t + (r[key] || 0), 0);
  const cards = leagues.map((ld) => {
    const all = ld.me.roster.filter((r) => r.pid && BENCH_SLOTS.includes(r.slot));
    const shown = all.filter((r) => matchesFilter(r.game)).sort((a, b) => sortValue(b) - sortValue(a) || b.proj - a.proj);
    return h('div', { class: 'game bench-card', style: `--lc:${ld.color}` },
      h('div', { class: 'g-head' },
        h('div', null,
          h('span', { class: 'matchup' }, ld.league.name),
          h('div', null, h('span', { class: 'gstat' }, teamLabel(ld, ld.me)))),
        h('span', { class: 'bench-sum' }, `${fmt2(total(all, 'pts'))} pts`, h('span', { class: 'pj' }, ` · proj ${fmt2(total(all, 'proj'))}`))),
      h('div', { class: 'col' },
        shown.length ? shown.map(rosterRow)
          : h('div', { class: 'empty' }, all.length ? 'No bench players in this time window' : 'Nobody on the bench')));
  });
  return h('div', { class: 'games' }, cards);
}

// ---------- live plays ----------
// { key, games: { [sleeperGameId]: { final, plays: { [playId]: play } } } } — only the week on screen is
// saved (~1 MB a week), since Live plays only shows games in progress; older weeks are dropped.
let playsCache = null;
let playGameIds = null; // ESPN game id → Sleeper game id for the games we pull plays from
let lastPlays = new Map(); // pid → his latest scoring play, worked out on each render
const PLAY_KEEP = 300;  // plays kept per game
const PLAYS_SHOWN = 15; // Live plays is a snapshot: latest plays per column, not the full history

function slimPlay(p) {
  const m = p.metadata || {};
  const mins = m.time_remaining_minutes;
  return {
    id: p.play_id,
    t: Date.parse(m.play_time) || 0,
    seq: Number(m.sequence) || 0,
    q: m.quarter_name != null ? String(m.quarter_name) : '',
    clock: mins != null ? `${mins}:${String(m.time_remaining_seconds ?? 0).padStart(2, '0')}` : '',
    desc: m.fantasy_description || m.description || '',
    scoring: !!m.is_scoring_play,
    stats: (p.play_stats || [])
      .map((s) => ({ pid: s.player?.player_id, team: s.player?.team, stats: s.stats || {} }))
      .filter((s) => s.pid),
  };
}

const playsBackfilled = new Set(); // week keys whose full history we've pulled since the page opened

// Plays for every started game with one of your (or your opponents') starters. The first pull after
// opening grabs the whole week in one request (every play so far); after that, only the latest 20 of
// games still going — refreshes are 30s apart, far less than 20 plays. Only this week is saved.
async function updatePlays(cur) {
  const { state, week, model } = cur;
  const key = `plays-${state.season}-${state.seasonType}-${week}`;
  if (playsCache?.key !== key) {
    const saved = await store.get('plays');
    playsCache = saved?.key === key ? saved : { key, games: {} };
    if (playsCache !== saved) playsBackfilled.delete(key); // nothing saved for this week: pull it all again
    playGameIds = null;
  }
  const sched = await getSleeperSchedule(state.season, state.seasonType).catch(() => []);
  const teams = new Set(model.players.map((p) => p.info.team).filter(Boolean));
  const ids = {};     // ESPN game id → Sleeper game id
  const stateOf = {}; // Sleeper game id → pre | in | post
  for (const g of model.games) {
    if (g.none || g.state === 'pre' || !(teams.has(g.home) || teams.has(g.away))) continue;
    const gid = String(sched.find((s) => Number(s.week) === Number(week) && s.home === g.home && s.away === g.away)?.game_id || '');
    if (!/^\d+$/.test(gid)) continue;
    ids[g.id] = gid;
    stateOf[gid] = g.state;
  }
  const merge = (gid, plays) => {
    const entry = (playsCache.games[gid] ||= { final: false, plays: {} });
    for (const p of plays) {
      const sp = slimPlay(p);
      if (sp.stats.length) entry.plays[sp.id] = sp;
    }
    const all = Object.values(entry.plays);
    if (all.length > PLAY_KEEP) {
      all.sort((a, b) => b.t - a.t || b.seq - a.seq);
      entry.plays = Object.fromEntries(all.slice(0, PLAY_KEEP).map((p) => [p.id, p]));
    }
    if (stateOf[gid] === 'post') entry.final = true;
  };

  const wanted = Object.keys(stateOf);
  let pulled = false;
  if (wanted.length && !playsBackfilled.has(key)) {
    try {
      const byGame = {};
      for (const p of await getWeekPlays(state.season, state.seasonType, week)) {
        (byGame[String(p.game_id)] ||= []).push(p);
      }
      for (const gid of wanted) merge(gid, byGame[gid] || []);
      playsBackfilled.add(key);
      pulled = true;
    } catch { /* fall back to per-game pulls */ }
  }
  if (!pulled) {
    const live = wanted.filter((gid) => !playsCache.games[gid]?.final);
    await Promise.all(live.map((gid) => getGamePlays(state.season, state.seasonType, gid)
      .then((plays) => merge(gid, plays))
      .catch(() => { /* keep what we already have */ })));
    pulled = live.length > 0;
  }
  playGameIds = ids;
  if (pulled) await store.set('plays', playsCache);
}

// Plays are pulled on every refresh, whatever tab is open: Live plays lists them, and every player row
// shows his latest scoring play.
function loadPlays() {
  const cur = current;
  if (!cur) return;
  updatePlays(cur).then(() => { if (cur === current) render(); }).catch(() => {});
}

const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtPts(Math.abs(n));
const playWhen = (play) => {
  const quarter = /^\d$/.test(play.q) ? `Q${play.q}` : play.q;
  return quarter ? `${quarter} ${play.clock}`.trim() : '';
};

// One play's fantasy points for the players in it, split into your starters and your opponents'
// ({ for, against }). Each league scores it its own way; the biggest swing across leagues is kept.
function scorePlay(play, byPid, defs) {
  const items = { for: [], against: [] };
  const add = (pl, stats) => {
    for (const leg of pl.legs) {
      const pts = leagueProj(stats, leg.ld.league.scoring_settings);
      if (Math.abs(pts) < 0.005) continue;
      const bucket = items[leg.side > 0 ? 'for' : 'against'];
      let it = bucket.find((x) => x.pl === pl);
      if (!it) bucket.push((it = { pl, pts, legs: [] }));
      if (Math.abs(pts) > Math.abs(it.pts)) it.pts = pts; // biggest swing across leagues
      it.legs.push({ leg, pts });
    }
  };
  for (const s of play.stats) {
    const pl = byPid.get(s.pid);
    if (pl) add(pl, s.stats);
  }
  // Team defenses: add up the defenders' stats on this play (idp_sack → sack, idp_int → int, ...).
  for (const d of defs) {
    const agg = {};
    for (const s of play.stats) {
      if (s.team !== d.info.team) continue;
      for (const [k, v] of Object.entries(s.stats)) {
        if (k.startsWith('idp_') && typeof v === 'number') agg[k.slice(4)] = (agg[k.slice(4)] || 0) + v;
      }
    }
    if (Object.keys(agg).length) add(d, agg);
  }
  return items;
}

// Each player's latest fantasy-scoring play (pid → { pts, play }), for the "+0.3" beside his points.
// It stays until his next one, and goes away once his game is final.
function latestPlays(model) {
  const out = new Map();
  if (!playGameIds || !playsCache) return out;
  const byPid = new Map(model.players.map((p) => [p.pid, p]));
  const defs = model.players.filter((p) => p.info.pos === 'DEF');
  for (const g of model.games) {
    if (g.state === 'post') continue;
    const plays = playsCache.games[playGameIds[g.id]]?.plays;
    if (!plays) continue;
    for (const play of Object.values(plays).sort((a, b) => b.t - a.t || b.seq - a.seq)) {
      const { for: mine, against: theirs } = scorePlay(play, byPid, defs);
      for (const it of [...mine, ...theirs]) {
        if (!out.has(it.pl.pid)) out.set(it.pl.pid, { pts: it.pts, play });
      }
    }
  }
  return out;
}

// Two columns — plays by your starters, plays by your opponents' starters — newest first.
function renderPlays(model) {
  if (!playGameIds) return emptyFiltered('Loading plays…');
  const byPid = new Map(model.players.map((p) => [p.pid, p]));
  const defs = model.players.filter((p) => p.info.pos === 'DEF');
  const cols = { for: [], against: [] };
  for (const g of model.games) {
    if (g.none || g.state !== 'in' || !matchesFilter(g)) continue; // live games only — it's a snapshot
    const plays = playsCache?.games[playGameIds[g.id]]?.plays;
    if (!plays) continue;
    for (const play of Object.values(plays)) {
      const items = scorePlay(play, byPid, defs);
      for (const side of ['for', 'against']) {
        if (items[side].length) cols[side].push({ play, game: g, players: items[side] });
      }
    }
  }
  const newest = (a, b) => b.play.t - a.play.t || b.play.seq - a.play.seq;
  // Is anyone on this side on the field right now? If not, say so — and when they're up next.
  const onSide = (p, side) => p.legs.some((l) => (l.side > 0) === (side === 'for'));
  const idleBox = (side) => {
    const next = model.players
      .filter((p) => onSide(p, side) && p.game?.state === 'pre' && matchesFilter(p.game))
      .sort((a, b) => a.game.date - b.game.date)[0]?.game;
    return h('div', { class: 'lp-idle' },
      side === 'for' ? 'None of your players are playing right now.' : 'None of your opponents’ players are playing right now.',
      next ? h('div', { class: 'lp-next' }, `Next up: ${kickoff(next.date)} · ${next.away} @ ${next.home}${next.network ? ` · ${next.network}` : ''}`) : null);
  };
  const col = (cls, label, side, list) => {
    const live = model.players.some((p) => onSide(p, side) && p.game?.state === 'in' && matchesFilter(p.game));
    return h('div', { class: `lp-col ${cls}` },
      h('h4', null, label),
      !live ? idleBox(side)
        : list.length ? list.sort(newest).slice(0, PLAYS_SHOWN).map((it) => playItem(it, side))
        : h('div', { class: 'empty' }, 'No fantasy plays yet'));
  };
  return h('div', null,
    h('div', { class: 'lp-cols' },
      col('cheer', '▲ For you', 'for', cols.for),
      col('boo', '▼ Against you', 'against', cols.against)),
    h('div', { class: 'lp-note' }, `The latest ${PLAYS_SHOWN} fantasy-scoring plays for each side from games in progress, updating live. Team defenses count sacks, turnovers and TDs play by play; points-allowed changes aren’t tied to single plays.`));
}

function playItem(it, side) {
  const { play, game } = it;
  const when = [
    playWhen(play),
    `${game.away} @ ${game.home}`,
    play.t ? new Date(play.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null,
  ].filter(Boolean).join(' · ');
  return h('div', { class: 'lp' },
    it.players.map((x) => {
      const good = side === 'for' ? x.pts > 0 : x.pts < 0; // colored from your point of view
      return h('div', { class: 'lp-row bd-open', ...breakdownHandlers(x.pl.pid, x.legs.map((l) => l.leg.ld.league.league_id)) },
        h('span', {
          class: `lp-pts ${good ? 'good' : 'bad'}`,
          title: x.legs.map((l) => `${l.leg.ld.league.name}: ${signed(l.pts)}`).join('\n'),
        }, signed(x.pts)),
        h('span', { class: 'lp-name' }, x.pl.info.name),
        h('span', { class: 'pj' }, x.pl.info.pos),
        x.legs.map((l) => legChip(l.leg, `: ${signed(l.pts)}`)));
    }),
    h('div', { class: 'lp-desc' },
      play.scoring ? h('span', { class: 'lp-badge' }, /touchdown/i.test(play.desc) ? 'TD' : 'SCORE') : null,
      play.desc),
    h('div', { class: 'lp-when' }, when));
}

// ---------- app state / wiring ----------
const params = new URLSearchParams(location.search);
// The full tab is the bare page, so its address is just …/fantasy-sweat.html; the toolbar popup
// opens with ?popup=1 (set in manifest.json) and the popout with ?window=1.
const MODE = params.has('popup') ? 'popup' : params.has('window') ? 'window' : 'full';
let current = null;
let view = 'games';
let filter = 'all';        // what the user picked (remembered)
let activeFilter = 'all';  // what's applied — falls back to 'all' if that window isn't in this week
let windowsByKey = {};
let selectedLeagues = [];  // league_ids picked on the cards (empty = all leagues)
let nicknames = {};        // league_id → short name shown on player tags
let teamNicks = {};        // "league_id:team key" → team nickname shown on the league cards
let hiddenLeagues = [];    // league_ids unchecked in Settings — left out of everything
let leagueColors = {};     // league_id → color picked in Settings (otherwise the default for its position)
let espnLeagues = [];      // [{ id, teamId }] — ESPN leagues from Settings
let espnDraft = [];        // the same list while Settings is open (saved on Save)
let refreshTimer = null;
let pickedWeek = null;     // week chosen in the dropdown; null = follow the NFL's current week
let playerSort = 'points'; // By player order: 'points' or 'position' (remembered)
let sortClose = false;     // Settings: league cards ordered by closest matchup (win chance nearest 50%)
let tagTitles = false;     // Settings: league cards titled with the league's tag instead of its name

// Re-run the cheer/boo math using only the picked leagues' matchups; drops games with nothing at stake there.
// keepAll (for leagues hidden in Settings): keep every game, so the rest looks just like "all leagues".
function scopeToLeague(model, leagueIds, { keepAll = false } = {}) {
  if (!leagueIds?.length && !keepAll) return model;
  const keep = new Set(leagueIds);
  const scoped = new Map();
  for (const pl of model.players) {
    const legs = pl.legs.filter((l) => keep.has(l.ld.league.league_id));
    if (!legs.length) continue;
    const net = legs.reduce((s, l) => s + l.side, 0);
    scoped.set(pl.pid, {
      ...pl,
      legs,
      net,
      impact: legs.reduce((s, l) => s + l.side * Math.max(l.proj, 1), 0),
      verdict: net > 0 ? 'cheer' : net < 0 ? 'boo' : 'hedge',
      projShown: Math.max(...legs.map((l) => l.proj)),
      ptsShown: Math.max(...legs.map((l) => l.pts)),
    });
  }
  const games = model.games
    .map((g) => {
      const players = g.players.map((p) => scoped.get(p.pid)).filter(Boolean);
      return { ...g, players, stake: players.reduce((s, p) => s + Math.abs(p.impact), 0), projStake: projStakeOf(players) };
    })
    .filter((g) => keepAll || g.players.length);
  return { ...model, players: [...scoped.values()], games, leagueScoped: !keepAll || !!model.leagueScoped };
}

// ---------- time-window filter ----------
// Kickoffs on the same day within 45 min of each other are one window (e.g. Sun 4:05 / 4:25 PM).
function timeWindows(games) {
  const sorted = games.filter((g) => !g.none).sort((a, b) => a.date - b.date);
  const day = (d) => d.toLocaleDateString([], { weekday: 'short' });
  const time = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const wins = [];
  for (const g of sorted) {
    const last = wins[wins.length - 1];
    if (last && day(last.endDate) === day(g.date) && g.date - last.endDate <= 45 * 60_000) {
      last.endDate = g.date;
      last.times.add(time(g.date));
    } else {
      wins.push({ startDate: g.date, endDate: g.date, times: new Set([time(g.date)]) });
    }
  }
  return wins.map((w) => ({
    key: `w${+w.startDate}`,
    label: `${day(w.startDate)} ${[...w.times].join(' / ')}`,
    start: +w.startDate,
    end: +w.endDate,
  }));
}

function matchesFilter(g) {
  if (activeFilter === 'all') return true;
  if (!g || g.none) return false;
  if (activeFilter === 'live') return g.state === 'in';
  if (activeFilter === 'todo') return g.state !== 'post';
  const w = windowsByKey[activeFilter];
  return !!w && +g.date >= w.start && +g.date <= w.end;
}

// Time slots always come from the full schedule; the "with your players" counts follow the league selection.
function fillFilter(model, scoped = model) {
  const games = model.games.filter((g) => !g.none);
  const wins = timeWindows(games);
  windowsByKey = Object.fromEntries(wins.map((w) => [w.key, w]));
  // e.g. "Sun 1:00 PM — 8 games · 10 players for you, 5 against"
  const label = (name, pred) => {
    const list = games.filter(pred);
    if (!list.length) return `${name} — no games`;
    const ids = new Set(list.map((g) => g.id));
    const ps = scoped.players.filter((p) => p.game && ids.has(p.game.id));
    // Coin-flip players (yours in one league, an opponent's in another) count toward both numbers.
    const count = (v) => ps.filter((p) => p.verdict === v).length;
    const forYou = count('cheer') + count('hedge');
    const against = count('boo') + count('hedge');
    const who = ps.length
      ? `${forYou} player${forYou === 1 ? '' : 's'} for you, ${against} against`
      : 'none of your players';
    return `${name} — ${list.length} game${list.length === 1 ? '' : 's'} · ${who}`;
  };
  const opts = [
    ['all', label('All games', () => true)],
    ['live', label('Live now', (g) => g.state === 'in')],
    ['todo', label('Still to play', (g) => g.state !== 'post')],
    ...wins.map((w) => [w.key, label(w.label, (g) => +g.date >= w.start && +g.date <= w.end)]),
  ];
  activeFilter = opts.some(([k]) => k === filter) ? filter : 'all';
  $('#window').replaceChildren(...opts.map(([k, label]) => h('option', { value: k }, label)));
  $('#window').value = activeFilter;
}

function setStatus(msg, isError = false) {
  const el = $('#status');
  el.textContent = msg || '';
  el.className = `status ${isError ? 'error' : ''}`;
  el.hidden = !msg;
}

// League cards in their usual order, or — with the Settings option — closest matchups first: win chance
// nearest 50% (as shown, to the whole percent), ties in the usual order, leagues without a matchup last.
function cardOrder(leagues) {
  if (!sortClose) return leagues;
  const gap = (ld) => (ld.opp ? Math.abs(Math.round((ld.winPct ?? 0.5) * 100) - 50) : Infinity);
  return leagues.map((ld, i) => ({ ld, i, gap: gap(ld) })).sort((a, b) => a.gap - b.gap || a.i - b.i).map((x) => x.ld);
}

function render() {
  if (!current) return;
  const { user } = current;
  // Leagues unchecked in Settings drop out of everything; the rest behave as if they were all you had.
  const full = current.model;
  const visible = full.leagues.filter((ld) => !hiddenLeagues.includes(ld.league.league_id));
  const model = visible.length < full.leagues.length
    ? { ...scopeToLeague(full, visible.map((ld) => ld.league.league_id), { keepAll: true }), leagues: visible }
    : full;
  const anyLive = model.games.some((g) => g.state === 'in');
  // Header subtitle: who and when (the week dropdown beside it already shows the week). LIVE is its own piece,
  // so on a narrow popup a long username is cut short with … instead of LIVE disappearing.
  $('#sub').replaceChildren(
    h('span', { class: 'sub-text' }, `${user ? `@${user.display_name} · ` : ''}updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`),
    ...(anyLive ? [h('span', { class: 'sub-live' }, '· LIVE')] : [])); // replaceChildren would print a null as "null"
  // Keep only picks that have a matchup this week; picking every league is the same as no filter.
  const selectable = model.leagues.filter((ld) => ld.opp);
  const picked = selectable.filter((ld) => selectedLeagues.includes(ld.league.league_id));
  selectedLeagues = picked.length && picked.length < selectable.length ? picked.map((ld) => ld.league.league_id) : [];
  const scoped = scopeToLeague(model, selectedLeagues);
  lastPlays = latestPlays(scoped); // each player's latest scoring play, for the rows drawn below

  $('#leagues').replaceChildren(...cardOrder(model.leagues).map(leagueCard));
  if (!model.leagues.length) {
    $('#leagues').replaceChildren(h('div', { class: 'status' }, full.leagues.length
      ? 'All your leagues are hidden. Turn one back on in Settings ⚙.'
      : 'No active leagues found for this season.'));
  }
  const chip = $('#leagueChip');
  chip.hidden = !selectedLeagues.length;
  if (selectedLeagues.length) {
    chip.textContent = picked.length === 1
      ? `Only ${picked[0].league.name} ✕`
      : `Only ${picked.map((ld) => leagueTag(ld.league)).join(' + ')} ✕`;
    chip.style.setProperty('--lc', picked.length === 1 ? picked[0].color : 'var(--accent)');
  }
  fillFilter(model, scoped);
  renderMustWatch(scoped);
  const views = { games: renderGames, players: renderPlayers, teams: renderTeams, plays: renderPlays, bench: renderBench };
  $('#view').replaceChildren(
    (views[view] || renderGames)(scoped),
    h('div', { class: 'foot' }, 'Data: Sleeper API & Game Center plays · ESPN fantasy (ESPN leagues) · schedule & live scores: ESPN. Chips show which league (+ yours, − opponent’s).'));
  $('#app').hidden = !$('#setup').hidden; // auto-refresh must not pop the dashboard up under Settings
  if (!model.games.some((g) => !g.none)) {
    setStatus('Couldn’t load the NFL schedule from ESPN — game times and live scores are missing for now.');
  }
  if (rosterOpen) renderRoster(); // keep an open roster's points live
  if (breakdownOpen) renderBreakdown(); // and an open breakdown's
}

// Sleeper usernames are letters, numbers and underscores — strips "@", spaces, etc.
const cleanUsername = (v) => String(v || '').replace(/[^A-Za-z0-9_]/g, '');

let refreshSeq = 0; // only the newest refresh may update the page
let lastRefreshStart = 0; // when the latest refresh began, for the tab-switch lockout

async function refresh() {
  lastRefreshStart = Date.now(); // before any await, so two quick tab clicks can't both start one
  const username = cleanUsername(await store.get('username')); // also fixes a saved "@name"
  if (!username && !espnLeagues.length) return showSetup();
  const seq = ++refreshSeq;
  const btn = $('#refresh');
  btn.innerHTML = '<span class="spin">↻</span>';
  if (!current) setStatus('Loading your matchups…');
  try {
    const data = await loadAll(username, pickedWeek);
    if (seq !== refreshSeq) return; // a newer refresh (e.g. another week) started meanwhile — it wins
    current = data;
    fillWeeks(current.state.week, current.week);
    setStatus('');
    render();
    loadPlays(); // after the main view, so plays never hold it up
  } catch (e) {
    if (seq !== refreshSeq) return;
    setStatus(`Couldn't load: ${e.message}`, true);
  } finally {
    if (seq === refreshSeq) btn.textContent = '↻';
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, nextRefreshDelay());
}

// Every 30 seconds while any game is live; otherwise wake up at the next kickoff (checking at least every 5 min).
function nextRefreshDelay() {
  const games = current?.model.games.filter((g) => !g.none) || [];
  if (games.some((g) => g.state === 'in')) return LIVE_REFRESH_MS;
  const untilKickoff = Math.min(...games.filter((g) => g.state === 'pre').map((g) => g.date - Date.now()));
  return Math.max(LIVE_REFRESH_MS, Math.min(IDLE_REFRESH_MS, untilKickoff));
}

// Rebuilt when the NFL week rolls over (a popout left open over Tuesday), so the • moves too.
function fillWeeks(currentWeek, selected) {
  const sel = $('#week');
  if (sel.dataset.current !== String(currentWeek)) {
    sel.replaceChildren(...Array.from({ length: 18 }, (_, i) =>
      h('option', { value: i + 1 }, `Wk ${i + 1}${i + 1 === currentWeek ? ' •' : ''}`)));
    sel.dataset.current = currentWeek;
  }
  sel.value = String(selected);
}

async function showSetup() {
  $('#setup').hidden = false;
  $('#app').hidden = true;
  setStatus('');
  const saved = cleanUsername(await store.get('username'));
  $('#username').value = saved;
  $('#userHint').hidden = true;
  $('#cancelSetup').hidden = !current; // nothing to go back to on first run (ESPN-only users included)
  $('#sortClose').checked = sortClose;
  $('#tagTitles').checked = tagTitles;

  // One row per league (once leagues have loaded): show/hide, its tag, and — folded away —
  // a nickname box for every team in it.
  const leagues = current?.model.leagues || [];
  $('#nickSection').hidden = !leagues.length;
  $('#nicks').replaceChildren(...leagues.map((ld) => {
    const id = ld.league.league_id;
    const fallback = initials(ld.league.name);
    const preview = h('span', { class: 'chip for', style: `--lc:${ld.color}` }, leagueTag(ld.league));
    const input = h('input', {
      class: 'nick', 'data-id': id, maxlength: '10', placeholder: fallback, title: 'Nickname shown on player chips',
      value: nicknames[id] || '', spellcheck: 'false', autocomplete: 'off',
    });
    input.addEventListener('input', () => { preview.textContent = input.value.trim() || fallback; });
    const show = h('input', { type: 'checkbox', class: 'show', 'data-id': id });
    show.checked = !hiddenLeagues.includes(id);
    // League color: clicking the tag preview opens the picker (an invisible color input laid over it);
    // the row and tag repaint live, and ↺ goes back to the default for its position.
    const color = h('input', {
      type: 'color', class: 'lcolor', 'data-id': id, 'data-default': ld.defaultColor, value: ld.color,
      title: 'Click to change the league color',
    });
    const reset = h('button', { type: 'button', class: 'ghost lreset', title: 'Back to the default color' }, '↺');
    const row = h('div', { class: `nick-row ${show.checked ? '' : 'off'}`, style: `--lc:${ld.color}` },
      h('label', { class: 'nick-name', title: `Show ${ld.league.name}` }, show, h('span', { class: 'nm' }, ld.league.name)),
      input, h('span', { class: 'lcolor-pick' }, preview, color), reset);
    const paint = () => {
      row.style.setProperty('--lc', color.value);
      preview.style.setProperty('--lc', color.value);
      reset.classList.toggle('gone', color.value === ld.defaultColor);
    };
    paint();
    color.addEventListener('input', paint);
    reset.addEventListener('click', () => { color.value = ld.defaultColor; paint(); });
    show.addEventListener('change', () => row.classList.toggle('off', !show.checked));

    const teams = ld.teams || [];
    if (!teams.length) return h('div', { class: 'lg-set' }, row);
    const named = teams.filter((t) => teamNicks[teamNickKey(ld, t.key)]).length;
    return h('div', { class: 'lg-set' }, row,
      h('details', { class: 'team-nicks' },
        h('summary', null, `Team nicknames${named ? ` (${named} set)` : ''}`),
        teams.map((t) => h('label', { class: 'team-row' },
          h('span', { class: 'nick-name', title: t.user ? `${t.name} (${t.user})` : t.name },
            t.name, t.user && t.user !== t.name ? h('span', { class: 'un' }, ` (${t.user})`) : null),
          h('input', {
            class: 'tnick', 'data-key': teamNickKey(ld, t.key), maxlength: '24', placeholder: 'Nickname',
            value: teamNicks[teamNickKey(ld, t.key)] || '', spellcheck: 'false', autocomplete: 'off',
          })))));
  }));
  // ESPN leagues: one row per league with a "which team is yours" picker.
  espnDraft = espnLeagues.map((l) => ({ ...l }));
  $('#espnId').value = '';
  $('#espnHint').hidden = true;
  renderEspnRows();
  $('#username').focus();
  // Remember how Settings looked on opening, so leaving by the logo (or ⚙) can tell if anything changed.
  setupSnapshot = settingsSnapshot();
  $('#discardPrompt').hidden = true;
  if (current) {
    $('#brand').classList.add('back');
    $('#brand').title = 'Back to the main view';
  }
  checkForUpdate({ force: true }); // opening Settings always asks the store (Chrome may still throttle it)
}

function renderEspnRows() {
  $('#espnList').replaceChildren(...espnDraft.map((l, i) => {
    const name = h('span', { class: 'nick-name' }, `ESPN league ${l.id}`);
    const select = h('select', { class: 'espn-team', title: 'Which team is yours?' }, h('option', { value: '' }, 'Loading teams…'));
    select.addEventListener('change', () => { espnDraft[i].teamId = select.value ? Number(select.value) : null; });
    getEspnMeta(l.id).then((meta) => {
      name.textContent = meta.name;
      name.title = meta.name;
      select.replaceChildren(
        h('option', { value: '' }, '— pick your team —'),
        ...meta.teams.map((t) => h('option', { value: t.id }, t.owner ? `${t.name} (${t.owner})` : t.name)));
      select.value = l.teamId != null ? String(l.teamId) : '';
    }).catch(() => select.replaceChildren(h('option', { value: '' }, 'Couldn’t load teams')));
    const remove = h('button', {
      type: 'button', class: 'ghost x', title: 'Remove this league',
      onclick: () => { espnDraft.splice(i, 1); renderEspnRows(); },
    }, '✕');
    return h('div', { class: 'espn-row' }, name, select, remove);
  }));
}

async function addEspnLeague() {
  const id = $('#espnId').value.replace(/\D/g, '');
  const say = (msg) => { $('#espnHint').textContent = msg; $('#espnHint').hidden = !msg; };
  if (!id) return say('Enter the number after "leagueId=" in the league’s ESPN web address.');
  if (espnDraft.some((l) => l.id === id)) return say('That league is already added.');
  say('Checking the league…');
  try {
    await getEspnMeta(id);
    espnDraft.push({ id, teamId: null });
    $('#espnId').value = '';
    say('');
    renderEspnRows();
  } catch (e) {
    say(e.message === 'private'
      ? 'That league is private. Only public ESPN leagues work for now — the commissioner can make it viewable to the public in the league’s settings.'
      : e.message === 'notfound' ? 'No ESPN league with that ID this season.' : 'Couldn’t reach ESPN — try again.');
  }
}

function hideSetup() {
  $('#setup').hidden = true;
  $('#discardPrompt').hidden = true;
  $('#brand').classList.remove('back');
  $('#brand').removeAttribute('title');
  if (current) $('#app').hidden = false;
}

// Settings as it stood when it opened: the ESPN list plus every box and checkbox in the form.
let setupSnapshot = '';
const settingsSnapshot = () => JSON.stringify([
  espnDraft,
  [...$('#setup').querySelectorAll('input')].map((i) => (i.type === 'checkbox' ? i.checked : i.value)),
]);

// Back to the main view without saving — the logo, or ⚙ again. If anything was changed, ask first.
function leaveSetup() {
  if ($('#setup').hidden || !current) return; // first run: there's no main view to go back to yet
  if (settingsSnapshot() === setupSnapshot) return hideSetup();
  $('#discardPrompt').hidden = false;
  $('#discardPrompt').scrollIntoView({ block: 'nearest' });
  $('#discardKeep').focus();
}

// Nickname boxes → { key: nickname }; a box left blank removes that nickname.
function collectInputs(saved, selector, keyAttr) {
  const next = { ...saved };
  document.querySelectorAll(selector).forEach((input) => {
    const v = input.value.trim();
    if (v) next[input.dataset[keyAttr]] = v;
    else delete next[input.dataset[keyAttr]];
  });
  return next;
}

$('#setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanUsername($('#username').value);
  if (!name && !espnDraft.some((l) => l.teamId != null)) {
    $('#userHint').textContent = espnDraft.length
      ? 'Pick your team in the ESPN league below, or enter a Sleeper username.'
      : 'Enter your Sleeper username, or add an ESPN league below.';
    $('#userHint').hidden = false;
    return;
  }
  const espnChanged = JSON.stringify(espnDraft) !== JSON.stringify(espnLeagues);
  espnLeagues = espnDraft.map((l) => ({ id: l.id, teamId: l.teamId }));
  await store.set('espnLeagues', espnLeagues);
  nicknames = collectInputs(nicknames, '#nicks .nick', 'id');
  await store.set('nicknames', nicknames);
  teamNicks = collectInputs(teamNicks, '#nicks .tnick', 'key');
  await store.set('teamNicks', teamNicks);
  const hidden = new Set(hiddenLeagues); // leagues not listed right now keep their setting
  document.querySelectorAll('#nicks .show').forEach((c) => (c.checked ? hidden.delete(c.dataset.id) : hidden.add(c.dataset.id)));
  hiddenLeagues = [...hidden];
  await store.set('hiddenLeagues', hiddenLeagues);
  // Only colors changed from the default are saved; repaint the loaded leagues so no refetch is needed.
  document.querySelectorAll('#nicks .lcolor').forEach((c) => {
    if (c.value === c.dataset.default) delete leagueColors[c.dataset.id];
    else leagueColors[c.dataset.id] = c.value;
  });
  await store.set('leagueColors', leagueColors);
  for (const ld of current?.model.leagues || []) ld.color = leagueColors[ld.league.league_id] || ld.defaultColor;
  sortClose = $('#sortClose').checked;
  await store.set('sortClose', sortClose);
  tagTitles = $('#tagTitles').checked;
  await store.set('tagTitles', tagTitles);
  const userChanged = name !== cleanUsername(await store.get('username')); // none saved reads as ''
  await store.set('username', name);
  hideSetup();
  if (userChanged || espnChanged || !current) {
    current = null;
    refresh();
  } else {
    render(); // nicknames / colors / shown leagues / card order only — no need to refetch
  }
});
$('#cancelSetup').addEventListener('click', hideSetup);
$('#espnAdd').addEventListener('click', addEspnLeague);
$('#espnId').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
$('#espnId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addEspnLeague(); } // don't submit the whole form
});
// Block special characters as they're typed/pasted, and say why.
$('#username').addEventListener('input', (e) => {
  const el = e.target;
  const clean = cleanUsername(el.value);
  if (clean !== el.value) {
    el.value = clean;
    $('#userHint').textContent = 'Letters, numbers and _ only — no @ needed.';
    $('#userHint').hidden = false;
  }
});
$('#settings').addEventListener('click', () => ($('#setup').hidden ? showSetup() : leaveSetup()));
$('#brand').addEventListener('click', leaveSetup);
$('#brand').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); leaveSetup(); } });
$('#discardKeep').addEventListener('click', () => { $('#discardPrompt').hidden = true; });
$('#discardLeave').addEventListener('click', hideSetup);
// Esc closes the top panel first: a breakdown opened from a roster leaves the roster showing.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (breakdownOpen) closeBreakdown();
  else if (rosterOpen) closeRoster();
});
$('#refresh').addEventListener('click', refresh);
$('#week').addEventListener('change', (e) => {
  // Picking the current week means "follow along", so a popout left open moves on to next week by itself.
  const w = Number(e.target.value);
  pickedWeek = w === Number(e.target.dataset.current) ? null : w;
  current = null;
  refresh();
});
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.getURL;
const pageURL = (query = '') => {
  const page = query ? `fantasy-sweat.html?${query}` : 'fantasy-sweat.html';
  return isExtension ? chrome.runtime.getURL(page) : page;
};

// Bottom of Settings: the version actually running (the store copy, or an unpacked folder's manifest),
// "Update now" when the store has a newer one, and a link to what changed in each version.
let appVersion = null;
async function showVersion() {
  if (!appVersion) {
    try {
      appVersion = isExtension && chrome.runtime.getManifest
        ? chrome.runtime.getManifest().version
        : (await (await fetch('manifest.json', { cache: 'no-store' })).json()).version;
    } catch { /* leave the line hidden */ }
  }
  if (!appVersion) return;
  $('#appVersion').replaceChildren(
    `Fantasy Sweat v${appVersion} · `,
    ...(updateVersion ? [h('b', { class: 'update-note' }, `v${updateVersion} available`), ' ', updateButton(), ' · '] : []),
    h('a', { href: 'https://github.com/LilShrimper/FantasySweat/releases', target: '_blank', rel: 'noopener' }, 'What’s new'));
  $('#appVersion').hidden = false;
}

// ---------- store updates ----------
// Chrome updates store installs by itself every few hours. This asks the Web Store now — when Fantasy
// Sweat opens (at most every 30 minutes) and whenever Settings opens — and offers to restart onto a newer
// version. Only store installs can be updated: Chrome adds update_url to their manifest, not unpacked ones.
// A version still in Google's review isn't offered yet; the store keeps serving the last approved one.
const UPDATE_CHECK_MS = 30 * 60_000; // Chrome also rate-limits these itself ("throttled")
const storeRuntime = () => (typeof chrome !== 'undefined' && chrome.runtime?.requestUpdateCheck
  && chrome.runtime.getManifest?.()?.update_url ? chrome.runtime : null);
const isNewer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
};
let updateVersion = null; // a newer version waiting in the store, if one was found

async function checkForUpdate({ force = false } = {}) {
  const rt = storeRuntime();
  if (!rt) return;
  const running = rt.getManifest().version;
  const saved = (await store.get('storeUpdate')) || {}; // { checkedAt, version } from the last check
  updateVersion = saved.version && isNewer(saved.version, running) ? saved.version : null;
  showUpdate();
  if (!force && Date.now() - (saved.checkedAt || 0) < UPDATE_CHECK_MS) return;
  try {
    const res = await rt.requestUpdateCheck(); // { status: 'update_available' | 'no_update' | 'throttled', version }
    if (res?.status === 'throttled') return;   // Chrome was asked too recently — keep what we knew
    updateVersion = res?.status === 'update_available' && res.version && isNewer(res.version, running) ? res.version : null;
    await store.set('storeUpdate', { checkedAt: Date.now(), version: updateVersion });
    showUpdate();
  } catch { /* offline, or Chrome wouldn't check — try again next time */ }
}

// A newer store version: a bar above the league cards, and "Update now" beside the version in Settings.
async function showUpdate() {
  const bar = $('#updateBar');
  if (!updateVersion) {
    bar.hidden = true;
    return showVersion();
  }
  // Pressed Update now but still on the old version: Chrome finishes once every Fantasy Sweat window is closed.
  const tried = await store.get('updateTried');
  const stuck = tried?.version === updateVersion && Date.now() - tried.at < 30 * 60_000;
  bar.replaceChildren(
    h('span', null, stuck
      ? `Still finishing the update to v${updateVersion}. Close every Fantasy Sweat window, then open it again.`
      : `Fantasy Sweat v${updateVersion} is available.`),
    updateButton());
  bar.hidden = false;
  showVersion();
}

const updateButton = () => h('button', { type: 'button', class: 'update-now', onclick: applyUpdate }, 'Update now');

// Restart Fantasy Sweat onto the new version (this closes the popup, popout and full tab).
async function applyUpdate() {
  await store.set('updateTried', { version: updateVersion, at: Date.now() });
  chrome.runtime.reload();
}

// Chrome also says so itself when an update has downloaded while Fantasy Sweat is open.
try {
  chrome.runtime.onUpdateAvailable.addListener((details) => {
    updateVersion = details.version;
    store.set('storeUpdate', { checkedAt: Date.now(), version: details.version });
    showUpdate();
  });
} catch { /* not running as an extension */ }

// Full-tab view: bring back the one that's already open (found by its page), or open it. From the
// popout this is "Back to tab", which also closes the popout, so clicks can't pile up new tabs.
$('#expand').addEventListener('click', async () => {
  const url = pageURL();
  if (!isExtension || !chrome.tabs?.create) {
    window.open(url, 'fantasy-sweat-full'); // named, so the same tab is reused
  } else {
    let open = null;
    try {
      [open] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
    } catch { /* couldn't check — open a new one */ }
    if (open) {
      await chrome.tabs.update(open.tabId, { active: true });
      await chrome.windows.update(open.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
  }
  if (MODE !== 'full') window.close();
});

// Pop out into a standalone window; re-focuses the existing one instead of opening duplicates.
$('#popout').addEventListener('click', async () => {
  const url = pageURL('window=1');
  if (!isExtension || !chrome.windows?.create) {
    window.open(url, 'fantasy-sweat', 'popup,width=500,height=820');
    return;
  }
  // Already open? Find it by its page, not a saved window id — Chrome reuses window ids after a
  // restart, so a saved id could point at some other window.
  try {
    const [open] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
    if (open) {
      await chrome.windows.update(open.windowId, { focused: true });
      if (MODE === 'popup') window.close();
      return;
    }
  } catch { /* couldn't check — just open a new one */ }
  const b = (await store.get('popoutBounds')) || {};
  await chrome.windows.create({
    url, type: 'popup', width: b.width || 500, height: b.height || 820,
    ...(b.left != null ? { left: b.left, top: b.top } : {}),
  });
  if (MODE === 'popup') window.close();
});
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  store.set('view', view);
  render(); // show the tab straight away with what's loaded…
  // …then fetch fresh scores, so a tab you come back to isn't a refresh behind what Live plays showed.
  // Skipped within 10 s of the last refresh (or while one is loading), so flipping tabs can't spam requests.
  if (current && Date.now() - lastRefreshStart >= TAB_REFRESH_LOCKOUT_MS) refresh();
}));

// An unpacked copy (loaded from a local folder for testing) says DEV — on its toolbar icon and next to the
// title — so it can't be mistaken for the store version. Chrome only adds update_url to store installs,
// so the store copy never shows it. The badge is set when this copy first opens and lasts until Chrome quits.
function markDevCopy() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest || chrome.runtime.getManifest().update_url) return;
  $('#devTag').hidden = false;
  try {
    chrome.action.setBadgeText({ text: 'DEV' });
    chrome.action.setBadgeBackgroundColor({ color: '#f5b942' });
    chrome.action.setBadgeTextColor?.({ color: '#0f1420' });
  } catch { /* no toolbar button to badge */ }
}

(async function init() {
  if (MODE === 'full') {
    document.body.classList.add('full');
    $('#expand').hidden = true;
  }
  if (MODE === 'window') {
    document.body.classList.add('win');
    $('#popout').hidden = true;
    $('#expand').textContent = '↩ Back to tab';
    $('#expand').title = 'Close this window and go back to the full tab';
    // Remember the popout's size/position for next time.
    const saveBounds = () => store.set('popoutBounds', { width: outerWidth, height: outerHeight, left: screenX, top: screenY });
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(saveBounds, 400); });
    addEventListener('beforeunload', saveBounds);
  }
  view = (await store.get('view')) || 'games';
  filter = (await store.get('filter')) || 'all';
  playerSort = (await store.get('playerSort')) === 'position' ? 'position' : 'points';
  sortClose = (await store.get('sortClose')) === true;
  tagTitles = (await store.get('tagTitles')) === true;
  const savedLeagues = await store.get('leagues');
  selectedLeagues = Array.isArray(savedLeagues) ? savedLeagues : [];
  nicknames = (await store.get('nicknames')) || {};
  teamNicks = (await store.get('teamNicks')) || {};
  hiddenLeagues = (await store.get('hiddenLeagues')) || [];
  leagueColors = (await store.get('leagueColors')) || {};
  espnLeagues = (await store.get('espnLeagues')) || [];
  $('#leagueChip').addEventListener('click', () => {
    selectedLeagues = [];
    store.set('leagues', []);
    render();
  });
  $('#window').addEventListener('change', (e) => {
    filter = e.target.value;
    store.set('filter', filter);
    render();
  });
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.view === view));
  showVersion();
  markDevCopy();
  checkForUpdate(); // at most every 30 minutes; a newer version found before still shows
  refresh();
})();
