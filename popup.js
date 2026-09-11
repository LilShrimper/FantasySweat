'use strict';

const SLEEPER = 'https://api.sleeper.app/v1';
const PROJ = 'https://api.sleeper.com/projections/nfl';
const STATS = 'https://api.sleeper.com/stats/nfl';
const POS_QS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'].map((p) => `position[]=${p}`).join('&');
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
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
  const cached = await store.get('playerDump2');
  if (cached && Date.now() - cached.t < PLAYER_CACHE_MS) return cached.map;
  const all = await getJSON(`${SLEEPER}/players/nfl`);
  const map = {};
  for (const [id, p] of Object.entries(all)) {
    map[id] = [p.first_name || '', p.last_name || '', p.position || '', p.team || null, p.injury_status || null, p.number ?? null];
  }
  await store.set('playerDump2', { t: Date.now(), map });
  store.set('playerDump', null); // old cache format without jersey numbers
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

const normTeam = (abbr) => ({ WSH: 'WAS' })[abbr] || abbr;

// ESPN gives "8-9" or "8-8-1"; always show W-L-T.
function wlt(competitor) {
  const summary = competitor.records?.find((r) => r.type === 'total')?.summary || '0-0';
  const [w = 0, l = 0, t = 0] = summary.split('-').map((n) => Number(n) || 0);
  return `${w}-${l}-${t}`;
}

async function getGames(season, week, seasonType) {
  const d = await getJSON(`${ESPN}?week=${week}&seasontype=${seasonType === 'post' ? 3 : 2}&dates=${season}`);
  const byTeam = {};
  for (const e of d.events || []) {
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
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
  const mine = (rosters || []).find((r) => r.owner_id === uid || (r.co_owners || []).includes(uid));
  if (!mine) return { league, skip: 'You don’t have a roster here' };
  const myM = (matchups || []).find((m) => m.roster_id === mine.roster_id);
  if (!myM) return { league, skip: 'No matchup this week' };
  const oppM = myM.matchup_id != null
    ? matchups.find((m) => m.matchup_id === myM.matchup_id && m.roster_id !== myM.roster_id)
    : null;
  const oppRoster = oppM && rosters.find((r) => r.roster_id === oppM.roster_id);
  const findUser = (id) => (users || []).find((u) => u.user_id === id);

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
  const side = (m, roster, ownerId) => {
    const u = findUser(ownerId);
    const s = stats(roster);
    return {
      m,
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
    me: side(myM, mine, uid),
    opp: oppM ? side(oppM, oppRoster, oppRoster?.owner_id) : null,
    skip: oppM ? null : 'Bye week (no opponent)',
  };
}

function shortName(first, last, pos, team, pid) {
  if (pos === 'DEF') return `${team || pid} D/ST`;
  return first ? `${first[0]}. ${last}` : last || `Player ${pid}`;
}

function playerInfo(pid, proj, dump) {
  const pr = proj[pid];
  const d = dump?.[pid];
  const num = d?.[5] ?? null; // jersey number (only in the full player list)
  if (pr?.player) {
    const p = pr.player;
    const team = pr.team || p.team;
    return { name: shortName(p.first_name, p.last_name, p.position, team, pid), pos: p.position, team, inj: p.injury_status, num };
  }
  if (d) return { name: shortName(d[0], d[1], d[2], d[3], pid), pos: d[2], team: d[3], inj: d[4], num };
  if (/^[A-Z]{2,3}$/.test(pid)) return { name: `${pid} D/ST`, pos: 'DEF', team: pid, inj: null, num: null };
  return { name: `Player ${pid}`, pos: '?', team: null, inj: null, num: null };
}

async function loadAll(username, weekOverride) {
  const state = await getState();
  const week = weekOverride || state.week;
  const user = await getJSON(`${SLEEPER}/user/${encodeURIComponent(username)}`);
  if (!user?.user_id) throw new Error(`Couldn't find a Sleeper user named "${username}".`);

  const allLeagues = (await getJSON(`${SLEEPER}/user/${user.user_id}/leagues/nfl/${state.season}`)) || [];
  const leagues = allLeagues.filter((l) => !['pre_draft', 'drafting'].includes(l.status));

  // Season points ranks only mean something once Week 1 is done; until then use the preseason PPR rank.
  const useSeasonRanks = state.week > 1 || state.seasonType === 'post';
  const [proj, games, leagueData, dump, seasonRanks] = await Promise.all([
    getProjections(state.season, week, state.seasonType).catch(() => ({})),
    getGames(state.season, week, state.seasonType).catch(() => ({})),
    Promise.all(leagues.map((l) => loadLeague(l, user.user_id, week).catch((e) => ({ league: l, skip: e.message })))),
    getPlayerDump().catch(() => null),
    useSeasonRanks ? getSeasonRanks(state.season, state.seasonType).catch(() => null) : null,
  ]);

  let ranks = { map: seasonRanks || {}, season: !!seasonRanks };
  if (!seasonRanks) {
    for (const [pid, p] of Object.entries(proj)) {
      const r = p.stats?.pos_adp_dd_ppr;
      if (r && r < 999) ranks.map[pid] = Math.round(r); // 999 = unranked (mostly K/DEF)
    }
  }

  return { state, week, user, model: buildModel(leagueData, proj, dump, games, ranks) };
}

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

function buildModel(leagueData, proj, dump, games, ranks) {
  const players = new Map();
  const leagues = leagueData.map((ld, i) => ({ ...ld, color: LEAGUE_COLORS[i % LEAGUE_COLORS.length] }));

  for (const ld of leagues) {
    if (!ld.me) continue;
    const addSide = (matchup, side) => {
      const pts = matchup.players_points || {};
      for (const pid of matchup.starters || []) {
        if (!pid || pid === '0') continue; // empty lineup slot
        let pl = players.get(pid);
        if (!pl) players.set(pid, (pl = { pid, legs: [], net: 0, impact: 0 }));
        const pj = leagueProj(proj[pid]?.stats, ld.league.scoring_settings);
        pl.legs.push({ ld, side, pts: pts[pid] ?? 0, proj: pj });
        pl.net += side;
        pl.impact += side * Math.max(pj, 1); // weight by projection; unprojected guys still count a little
      }
    };
    addSide(ld.me.m, +1);
    if (ld.opp) addSide(ld.opp.m, -1);
  }

  for (const pl of players.values()) {
    pl.info = playerInfo(pl.pid, proj, dump);
    pl.rank = ranks?.map[pl.pid] ?? null;
    pl.game = games[pl.info.team] || null;
    pl.verdict = pl.net > 0 ? 'cheer' : pl.net < 0 ? 'boo' : 'hedge';
    pl.projShown = Math.max(...pl.legs.map((l) => l.proj));
    pl.ptsShown = Math.max(...pl.legs.map((l) => l.pts));
  }

  // Live projected total per side, built exactly like Sleeper's: each starter's in-game projection
  // (or his points so far when that comes out 0/NaN, e.g. a bye), then Sleeper's win formula.
  for (const ld of leagues) {
    if (!ld.me) continue;
    const scoring = ld.league.scoring_settings;
    const project = (m) => {
      let current = 0, total = 0, open = 0;
      for (const pid of m.starters || []) {
        if (!pid || pid === '0') continue;
        const g = players.get(pid)?.game;
        const pts = m.players_points?.[pid] ?? 0;
        current += pts;
        total += sleeperLiveProj(pts, leagueProj(proj[pid]?.stats, scoring), secondsLeft(g)) || pts;
        if (g && g.state !== 'post') open++;
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
const initials = (name) => {
  const words = name.replace(/[^\p{L}\p{N}\s&]/gu, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || '?').slice(0, 3).toUpperCase();
};
const kickoff = (d) => d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const leagueTag = (league) => nicknames[league.league_id] || initials(league.name);
const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
// Red (0%) → yellow → green (100%); lightness comes from the theme so it reads in light and dark.
const winColor = (p) => `hsl(${Math.round(p * 130)} 70% var(--wl))`;

function leagueCard(ld) {
  if (ld.skip && !ld.opp) {
    return h('div', { class: 'lg skip', style: `--lc:${ld.color}` },
      h('div', { class: 'lg-head' }, h('span', { class: 'lg-name' }, ld.league.name), h('span', null, ld.skip)));
  }
  const me = ld.me, opp = ld.opp;
  const p = ld.winPct ?? 0.5;
  const color = winColor(p);
  const verdict = ld.final
    ? (me.m.points > opp.m.points ? 'Won' : me.m.points < opp.m.points ? 'Lost' : 'Tied')
    : Math.round(p * 100) === 50 ? 'Toss-up' : p > 0.5 ? 'Projected win' : 'Projected loss';
  const who = (s) => h('div', { class: 'tn', title: s.custom ? `${s.name} (${s.user})` : s.name },
    s.name, s.custom && s.user ? h('span', { class: 'un' }, ` (${s.user})`) : null);
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
      h('span', { class: 'lg-name' }, ld.league.name),
      h('span', { class: 'wl', style: `color:${color}` }, verdict)),
    h('div', { class: 'lg-score' },
      h('div', { class: 'side' },
        who(me), standing(me),
        h('span', { class: 'pts', style: `color:${color}` }, fmtPts(me.m.points)), ' ',
        h('span', { class: 'pj' }, `proj ${fmt1(me.proj)}`)),
      h('div', { class: 'mid' },
        h('span', { class: 'vs' }, 'vs'),
        h('span', { class: 'pct', style: `color:${color}`, title: 'Your estimated chance to win' }, `${Math.round(p * 100)}%`)),
      h('div', { class: 'side r' },
        who(opp), standing(opp),
        h('span', { class: 'pj' }, `proj ${fmt1(opp.proj)}`), ' ',
        h('span', { class: 'pts', style: `color:${winColor(1 - p)}` }, fmtPts(opp.m.points)))), // their side of the odds
    h('div', { class: 'bar', title: `Win chance ${Math.round(p * 100)}%` }, h('i', { style: `width:${(p * 100).toFixed(1)}%` })));
}

function injBadge(inj) {
  if (!inj) return null;
  const code = { Questionable: 'Q', Doubtful: 'D', Out: 'O', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }[inj] || inj.slice(0, 3).toUpperCase();
  return h('span', { class: `inj ${code === 'Q' ? 'q' : ''}`, title: inj }, code);
}

function playerRow(pl, { showGame = false } = {}) {
  const g = pl.game;
  const started = g && g.state !== 'pre';
  const chips = pl.legs.map((l) => h('span', {
    class: `chip ${l.side > 0 ? 'for' : 'against'}`,
    style: `--lc:${l.ld.color}`,
    title: `${l.side > 0 ? 'Your starter' : `Started by ${l.ld.opp.name}`} in ${l.ld.league.name}`,
  }, leagueTag(l.ld.league)));
  let gameText = null;
  if (showGame) {
    if (!g) gameText = 'No game';
    else {
      const oppTeam = g.home === pl.info.team ? g.away : g.home;
      const at = g.home === pl.info.team ? 'vs' : '@';
      gameText = `${at} ${oppTeam} · ${g.state === 'pre' ? kickoff(g.date) : g.detail}`;
    }
  }
  return h('div', { class: 'pl' },
    h('div', { class: 'pl-main' },
      h('div', { class: 'pl-name' },
        pl.info.name,
        pl.info.num != null && pl.info.num !== '' ? h('span', { class: 'num' }, ` #${pl.info.num}`) : null),
      h('div', { class: 'pl-meta' },
        h('span', { title: rankTitle(pl) }, `${pl.info.pos}${pl.rank || ''}${pl.info.team ? ' · ' + pl.info.team : ''}`),
        injBadge(pl.info.inj), chips,
        gameText && h('span', null, gameText))),
    h('div', { class: `pl-pts ${g?.state === 'in' ? 'live' : ''} ${started ? '' : 'pre'}` },
      h('span', { class: 'v', title: 'Live fantasy points' }, fmt1(pl.ptsShown)),
      h('span', { class: 'p' }, `proj ${fmt1(pl.projShown)}`)));
}

const rankTitle = (pl) => {
  if (!pl.rank) return null;
  const tag = `${pl.info.pos}${pl.rank}`;
  return current?.model.rankSeason
    ? `${tag} in PPR points this season`
    : `${tag} preseason PPR rank — switches to season points rank after Week 1`;
};

const byImpactDesc = (a, b) => Math.abs(b.impact) - Math.abs(a.impact) || b.projShown - a.projShown;

const splitSides = (players) => ({
  cheer: players.filter((p) => p.verdict === 'cheer').sort(byImpactDesc),
  boo: players.filter((p) => p.verdict === 'boo').sort(byImpactDesc),
  hedge: players.filter((p) => p.verdict === 'hedge').sort(byImpactDesc),
});

// Cheer / root-against columns (+ a full-width "both sides" row when needed).
function sideColumns(players, { hideEmpty = false } = {}) {
  const { cheer, boo, hedge } = splitSides(players);
  const col = (cls, label, list) => h('div', { class: `col ${cls}` },
    h('h4', null, label),
    list.length ? list.map((p) => playerRow(p)) : h('div', { class: 'empty' }, 'Nobody'));
  const main = hideEmpty
    ? [cheer.length && col('cheer', '▲ Cheer for', cheer), boo.length && col('boo', '▼ Root against', boo)].filter(Boolean)
    : [col('cheer', '▲ Cheer for', cheer), col('boo', '▼ Root against', boo)];
  return h('div', { class: `cols ${main.length === 1 ? 'one' : ''}` },
    main,
    hedge.length ? col('hedge span', '↔ Both sides', hedge) : null);
}

function tally(players) {
  const { cheer, boo, hedge } = splitSides(players);
  return h('div', { class: 'tally' },
    cheer.length ? h('span', { class: 'c' }, `${cheer.length} for`) : null,
    boo.length ? h('span', { class: 'b' }, `${boo.length} against`) : null,
    hedge.length ? h('span', { class: 'h' }, `${hedge.length} both`) : null);
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
    // e.g. "49ers (0-0-0) 14 @ Rams (0-0-0) 10"
    const teamBit = (short, rec, score) => h('span', { class: 'tm' },
      short, h('span', { class: 'trec' }, ` (${rec})`), showScore && h('span', { class: 'sc' }, ` ${score}`));
    title = h('span', { class: 'matchup' },
      teamBit(g.awayShort || g.away, g.awayRec, g.awayScore), ' @ ',
      teamBit(g.homeShort || g.home, g.homeRec, g.homeScore));
    status = h('span', { class: `gstat ${g.state === 'in' ? 'live' : ''}` }, g.state === 'pre' ? kickoff(g.date) : g.detail);
  }

  if (!g.players.length) {
    return h('div', { class: `game quiet ${g.state || ''}` },
      h('div', { class: 'g-head' }, h('div', null, title, h('div', null, status)), noPlayersBadge()));
  }
  return h('div', { class: `game ${g.state || ''}` },
    h('div', { class: 'g-head' }, h('div', null, title, h('div', null, status)), tally(g.players)),
    sideColumns(g.players));
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
    line = `${isHome ? 'vs' : '@'} ${opp}${score} · ${g.state === 'pre' ? kickoff(g.date) : g.detail}`;
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
    hasPlayers ? sideColumns(t.players, { hideEmpty: true }) : null);
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
  return h('div', { class: 'pcols' },
    list('cheer', '▲ Cheer for', P.filter((p) => p.verdict === 'cheer').sort(byImpactDesc), `(${P.filter((p) => p.verdict === 'cheer').length})`),
    list('boo', '▼ Root against', P.filter((p) => p.verdict === 'boo').sort(byImpactDesc), `(${P.filter((p) => p.verdict === 'boo').length})`),
    P.some((p) => p.verdict === 'hedge')
      ? list('hedge', '↔ Both sides', P.filter((p) => p.verdict === 'hedge').sort(byImpactDesc), '(on your team in one league, opponent’s in another)')
      : null);
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
    h('span', { class: 'pj' }, ` — ${fmt1(top.projStake)} proj pts in play · ${c} to cheer, ${b} to boo · ${top.state === 'pre' ? kickoff(top.date) : top.detail}`));
  el.hidden = false;
}

// ---------- live plays ----------
let playsCache = null;  // { key, games: { [sleeperGameId]: { final, plays: { [playId]: play } } } } — saved per week
let playGameIds = null; // ESPN game id → Sleeper game id for the games we pull plays from
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
// games still going — refreshes are 30s apart, far less than 20 plays. Saved per week.
async function updatePlays(cur) {
  const { state, week, model } = cur;
  const key = `plays-${state.season}-${state.seasonType}-${week}`;
  if (playsCache?.key !== key) {
    playsCache = (await store.get(key)) || { key, games: {} };
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
  if (pulled) await store.set(key, playsCache);
}

const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtPts(Math.abs(n));

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
      next ? h('div', { class: 'lp-next' }, `Next up: ${kickoff(next.date)} · ${next.away} @ ${next.home}`) : null);
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
  const quarter = /^\d$/.test(play.q) ? `Q${play.q}` : play.q;
  const when = [
    quarter && `${quarter} ${play.clock}`.trim(),
    `${game.away} @ ${game.home}`,
    play.t ? new Date(play.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null,
  ].filter(Boolean).join(' · ');
  return h('div', { class: 'lp' },
    it.players.map((x) => {
      const good = side === 'for' ? x.pts > 0 : x.pts < 0; // colored from your point of view
      return h('div', { class: 'lp-row' },
        h('span', {
          class: `lp-pts ${good ? 'good' : 'bad'}`,
          title: x.legs.map((l) => `${l.leg.ld.league.name}: ${signed(l.pts)}`).join('\n'),
        }, signed(x.pts)),
        h('span', { class: 'lp-name' }, x.pl.info.name),
        h('span', { class: 'pj' }, x.pl.info.pos),
        x.legs.map((l) => h('span', {
          class: `chip ${l.leg.side > 0 ? 'for' : 'against'}`,
          style: `--lc:${l.leg.ld.color}`,
          title: `${l.leg.side > 0 ? 'Your starter' : `Started by ${l.leg.ld.opp.name}`} in ${l.leg.ld.league.name}: ${signed(l.pts)}`,
        }, leagueTag(l.leg.ld.league))));
    }),
    h('div', { class: 'lp-desc' },
      play.scoring ? h('span', { class: 'lp-badge' }, /touchdown/i.test(play.desc) ? 'TD' : 'SCORE') : null,
      play.desc),
    h('div', { class: 'lp-when' }, when));
}

// ---------- app state / wiring ----------
const params = new URLSearchParams(location.search);
const MODE = params.has('full') ? 'full' : params.has('window') ? 'window' : 'popup';
let current = null;
let view = 'games';
let filter = 'all';        // what the user picked (remembered)
let activeFilter = 'all';  // what's applied — falls back to 'all' if that window isn't in this week
let windowsByKey = {};
let selectedLeagues = [];  // league_ids picked on the cards (empty = all leagues)
let nicknames = {};        // league_id → short name shown on player tags
let refreshTimer = null;

// Re-run the cheer/boo math using only the picked leagues' matchups; drops games with nothing at stake there.
function scopeToLeague(model, leagueIds) {
  if (!leagueIds?.length) return model;
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
    .filter((g) => g.players.length);
  return { ...model, players: [...scoped.values()], games, leagueScoped: true };
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
    // Players on both sides (yours in one league, an opponent's in another) count toward both numbers.
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

function render() {
  if (!current) return;
  const { model, week, user } = current;
  const anyLive = model.games.some((g) => g.state === 'in');
  $('#sub').textContent = `@${user.display_name} · Week ${week} · updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${anyLive ? ' · LIVE' : ''}`;
  // Keep only picks that have a matchup this week; picking every league is the same as no filter.
  const selectable = model.leagues.filter((ld) => ld.opp);
  const picked = selectable.filter((ld) => selectedLeagues.includes(ld.league.league_id));
  selectedLeagues = picked.length && picked.length < selectable.length ? picked.map((ld) => ld.league.league_id) : [];
  const scoped = scopeToLeague(model, selectedLeagues);

  $('#leagues').replaceChildren(...model.leagues.map(leagueCard));
  if (!model.leagues.length) $('#leagues').replaceChildren(h('div', { class: 'status' }, 'No active leagues found for this season.'));
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
  const views = { games: renderGames, players: renderPlayers, teams: renderTeams, plays: renderPlays };
  $('#view').replaceChildren(
    (views[view] || renderGames)(scoped),
    h('div', { class: 'foot' }, 'Data: Sleeper API & Game Center plays · schedule & live scores: ESPN. Chips show which league (+ yours, − opponent’s).'));
  $('#app').hidden = false;
}

// Sleeper usernames are letters, numbers and underscores — strips "@", spaces, etc.
const cleanUsername = (v) => String(v || '').replace(/[^A-Za-z0-9_]/g, '');

async function refresh() {
  const username = cleanUsername(await store.get('username')); // also fixes a saved "@name"
  if (!username) return showSetup();
  const btn = $('#refresh');
  btn.innerHTML = '<span class="spin">↻</span>';
  if (!current) setStatus('Loading your matchups…');
  try {
    const weekSel = Number($('#week').value) || null;
    current = await loadAll(username, weekSel);
    fillWeeks(current.state.week, current.week);
    setStatus('');
    render();
    // Plays load after the main view so they never hold it up.
    const cur = current;
    updatePlays(cur).then(() => { if (cur === current && view === 'plays') render(); }).catch(() => {});
  } catch (e) {
    setStatus(`Couldn't load: ${e.message}`, true);
  } finally {
    btn.textContent = '↻';
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

function fillWeeks(currentWeek, selected) {
  const sel = $('#week');
  if (sel.options.length) { sel.value = String(selected); return; }
  for (let w = 1; w <= 18; w++) sel.append(h('option', { value: w }, `Wk ${w}${w === currentWeek ? ' •' : ''}`));
  sel.value = String(selected);
}

async function showSetup() {
  $('#setup').hidden = false;
  $('#app').hidden = true;
  setStatus('');
  const saved = cleanUsername(await store.get('username'));
  $('#username').value = saved;
  $('#userHint').hidden = true;
  $('#cancelSetup').hidden = !saved || !current;

  // One nickname box per league (only once leagues have loaded).
  const leagues = current?.model.leagues.filter((ld) => ld.me) || [];
  $('#nickSection').hidden = !leagues.length;
  $('#nicks').replaceChildren(...leagues.map((ld) => {
    const id = ld.league.league_id;
    const fallback = initials(ld.league.name);
    const preview = h('span', { class: 'chip for', style: `--lc:${ld.color}` }, leagueTag(ld.league));
    const input = h('input', {
      class: 'nick', 'data-id': id, maxlength: '10', placeholder: fallback,
      value: nicknames[id] || '', spellcheck: 'false', autocomplete: 'off',
    });
    input.addEventListener('input', () => { preview.textContent = input.value.trim() || fallback; });
    return h('label', { class: 'nick-row', style: `--lc:${ld.color}` },
      h('span', { class: 'nick-name', title: ld.league.name }, ld.league.name), input, preview);
  }));
  $('#username').focus();
}

function hideSetup() {
  $('#setup').hidden = true;
  if (current) $('#app').hidden = false;
}

$('#setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = cleanUsername($('#username').value);
  if (!name) {
    $('#userHint').textContent = 'Enter your Sleeper username (letters, numbers and _ only).';
    $('#userHint').hidden = false;
    return;
  }
  const next = { ...nicknames };
  document.querySelectorAll('#nicks .nick').forEach((input) => {
    const v = input.value.trim();
    if (v) next[input.dataset.id] = v;
    else delete next[input.dataset.id];
  });
  nicknames = next;
  await store.set('nicknames', nicknames);
  const userChanged = name !== (await store.get('username'));
  await store.set('username', name);
  hideSetup();
  if (userChanged || !current) {
    current = null;
    refresh();
  } else {
    render(); // nicknames only — no need to refetch
  }
});
$('#cancelSetup').addEventListener('click', hideSetup);
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
$('#settings').addEventListener('click', () => ($('#setup').hidden ? showSetup() : hideSetup()));
$('#refresh').addEventListener('click', refresh);
$('#week').addEventListener('change', () => { current = null; refresh(); });
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.getURL;
const pageURL = (query) => (isExtension ? chrome.runtime.getURL(`popup.html?${query}`) : `${location.pathname}?${query}`);

$('#expand').addEventListener('click', () => {
  if (isExtension && chrome.tabs?.create) chrome.tabs.create({ url: pageURL('full=1') });
  else window.open(pageURL('full=1'), '_blank');
});

// Pop out into a standalone window; re-focuses the existing one instead of opening duplicates.
$('#popout').addEventListener('click', async () => {
  const url = pageURL('window=1');
  if (!isExtension || !chrome.windows?.create) {
    window.open(url, 'fantasy-sweat', 'popup,width=500,height=820');
    return;
  }
  const existingId = await store.get('popoutId');
  if (existingId != null) {
    try {
      await chrome.windows.update(existingId, { focused: true });
      if (MODE === 'popup') window.close();
      return;
    } catch { /* that window was closed — open a new one */ }
  }
  const b = (await store.get('popoutBounds')) || {};
  const win = await chrome.windows.create({
    url, type: 'popup', width: b.width || 500, height: b.height || 820,
    ...(b.left != null ? { left: b.left, top: b.top } : {}),
  });
  await store.set('popoutId', win.id);
  if (MODE === 'popup') window.close();
});
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  store.set('view', view);
  render();
}));

(async function init() {
  if (MODE === 'full') {
    document.body.classList.add('full');
    $('#expand').hidden = true;
  }
  if (MODE === 'window') {
    document.body.classList.add('win');
    $('#popout').hidden = true;
    // Remember the popout's size/position for next time.
    const saveBounds = () => store.set('popoutBounds', { width: outerWidth, height: outerHeight, left: screenX, top: screenY });
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(saveBounds, 400); });
    addEventListener('beforeunload', saveBounds);
  }
  view = (await store.get('view')) || 'games';
  filter = (await store.get('filter')) || 'all';
  const savedLeagues = await store.get('leagues');
  const oldPick = await store.get('league'); // single pick saved by older versions
  selectedLeagues = Array.isArray(savedLeagues) ? savedLeagues : oldPick ? [oldPick] : [];
  nicknames = (await store.get('nicknames')) || {};
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
  refresh();
})();
