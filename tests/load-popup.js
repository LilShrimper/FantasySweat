// Loads popup.js outside the browser so its logic can be tested.
//
// popup.js is a plain browser script: it ends by wiring up buttons and starting a refresh. Here it runs
// in a sandbox with stand-ins for the few browser pieces it touches, and fetch never settles, so nothing
// is requested and the page never renders. Its functions are then handed back for the tests to call.
//
// Nothing in this file ships with the extension.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const popupPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'popup.js');

// The functions the tests use. This is appended to popup.js inside its own scope, the only way to reach
// a `const` declared there. Each is picked up on its own so an older copy of popup.js (say, when
// checking that a test really does catch a past bug) still loads, minus whatever it doesn't have yet.
const NAMES = [
  'leagueProj', 'scorePlay', 'slimPlay', 'downSpot', 'safeAvatar', 'teamLogo', 'isNewer', 'initials',
  'sleeperWinProb', 'secondsLeft', 'statLabel', 'fmt2', 'fmtPts', 'signed', 'liveScores', 'emptyLine',
  'byeLine', 'byeStarters', 'leftToPlay', 'playerInfo', 'cardName', 'leagueTag',
  'sittingLine', 'sittingStarters',
  'lookSummary', 'lookSnapshot', 'agoText', 'sinceParts', 'sinceClass',
  'headline', 'headlinePts', 'headlineProj', 'legPtsVary', 'legProjVary', 'samePts',
  'liveProj', 'sleeperLiveProj',
  'marginText', 'leadState', 'trackLeads', 'leadFlips', 'leadSeen', 'flipWhen',
];
const EXPORTS = `
globalThis.__api = {
  setCurrent: (v) => { current = v; },
  setNicknames: (v) => { nicknames = v; },
};
${NAMES.map((n) => `try { globalThis.__api.${n} = ${n}; } catch { /* not in this copy */ }`).join('\n')}`;

// h() checks `kid instanceof Node` to tell an element from text, so the fakes share this class.
class Node {}

// A DOM element with just the bits popup.js uses (h(), the Settings wiring, the tab buttons).
function fakeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    dataset: {},
    className: '',
    hidden: false,
    value: '',
    checked: false,
    style: { cssText: '', setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    append(...kids) { el.children.push(...kids); },
    replaceChildren(...kids) { el.children = kids; },
    setAttribute(k, v) { el.attrs[k] = v; if (k.startsWith('data-')) el.dataset[k.slice(5)] = v; else el[k] = v; },
    getAttribute: (k) => el.attrs[k],
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    remove() {},
    replaceWith() {},
    closest: () => null,
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      return el.children.map((k) => (k && typeof k === 'object' ? k.textContent : String(k ?? ''))).join('');
    },
    set(v) { el.children = [String(v)]; },
  });
  return Object.setPrototypeOf(el, Node.prototype);
}

export function loadPopup() {
  const sandbox = {
    console,
    Node,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => new Promise(() => {}), // never settles: no network, and the initial refresh stops here
    addEventListener() {},
    localStorage: {
      store: new Map(),
      getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
      setItem(k, v) { this.store.set(k, String(v)); },
      removeItem(k) { this.store.delete(k); },
    },
    location: { search: '', href: 'https://example.test/fantasy-sweat.html', reload() {} },
    document: {
      body: fakeEl('body'),
      documentElement: fakeEl('html'),
      createElement: (tag) => fakeEl(tag),
      querySelector: () => fakeEl(),
      querySelectorAll: () => [],
      addEventListener() {},
      hidden: false,
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(popupPath, 'utf8') + EXPORTS, sandbox, { filename: 'popup.js' });
  return sandbox.__api;
}
