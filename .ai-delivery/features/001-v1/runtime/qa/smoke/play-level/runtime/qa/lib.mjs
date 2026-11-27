// Driver layer: page operations, board reading and prediction (test plan §1.3).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
export const { chromium, devices } = require('playwright-core');

export const BASE_URL = process.env.AIDH_SERVICE_WEB_URL;
export const EVIDENCE_DIR = process.env.QA_EVIDENCE_DIR || path.join(process.cwd(), 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => Date.now();

// ---------- audio / media instrumentation (testability contract "音效的可观测点") ----------
export const AUDIO_INIT = `(() => {
  const st = { start: 0, stop: 0, media: 0, seq: 0, nodes: new Map(), log: [] };
  window.__qaAudio = st;
  const P = (window.AudioScheduledSourceNode || window.OscillatorNode).prototype;
  const oStart = P.start, oStop = P.stop;
  P.start = function (...a) {
    st.start++;
    const id = ++st.seq; this.__qaId = id;
    const ctx = this.context;
    st.nodes.set(id, { startedAt: performance.now(), ended: false, stops: [] });
    this.addEventListener('ended', () => { const n = st.nodes.get(id); if (n) { n.ended = true; n.endedAt = performance.now(); } });
    st.log.push({ t: performance.now(), ev: 'start', id, when: a[0], ct: ctx && ctx.currentTime });
    return oStart.apply(this, a);
  };
  P.stop = function (...a) {
    st.stop++;
    const n = st.nodes.get(this.__qaId);
    const ctx = this.context;
    if (n) n.stops.push({ t: performance.now(), when: a[0], ct: ctx && ctx.currentTime });
    st.log.push({ t: performance.now(), ev: 'stop', id: this.__qaId, when: a[0], ct: ctx && ctx.currentTime });
    return oStop.apply(this, a);
  };
  const oPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { st.media++; return oPlay.apply(this, a); };
  // Time at which an end dialog (过关/游戏结束) became visible; reset when it closes.
  st.dialogAt = null;
  setInterval(() => {
    const vis = [...document.querySelectorAll('[role="dialog"], dialog')].some((d) => /过关|游戏结束/.test((d.getAttribute('aria-label') || '') + (d.textContent || '')) && d.checkVisibility && d.checkVisibility());
    if (vis && st.dialogAt === null) st.dialogAt = performance.now();
    if (!vis) st.dialogAt = null;
  }, 20);
})();`;

// Sound starts around the moment the current end dialog appeared: "before" = starts called more than
// 200 ms before the dialog became visible (up to and including the last removal sound), "total" = all starts.
export async function endSoundCounts(page) {
  return page.evaluate(() => {
    const st = window.__qaAudio;
    if (!st || st.dialogAt === null) return null;
    const before = [...st.nodes.values()].filter((n) => n.startedAt < st.dialogAt - 200).length;
    return { before, total: st.start, dialogAt: Math.round(st.dialogAt) };
  });
}

export async function audioCounts(page) {
  return page.evaluate(() => {
    const st = window.__qaAudio;
    return st ? { start: st.start, stop: st.stop, media: st.media } : { start: 0, stop: 0, media: 0 };
  });
}

// ---------- browser contexts ----------
let browser;
export async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  return browser;
}
export async function closeBrowser() { if (browser) await browser.close().catch(() => {}); browser = null; }

export async function desktopContext(opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN', ...opts });
  await ctx.addInitScript(AUDIO_INIT);
  return ctx;
}
export async function mobileContext(viewport = { width: 412, height: 915 }, opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport, screen: viewport, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'zh-CN',
    userAgent: devices['Pixel 7'].userAgent, ...opts,
  });
  await ctx.addInitScript(AUDIO_INIT);
  return ctx;
}

export function attachLogs(page, log) {
  page.on('console', (m) => log.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('dialog', (d) => { log.push(`[js-dialog ${d.type()}] ${d.message()}`); d.dismiss().catch(() => {}); });
}

export async function openGame(ctx, log = []) {
  const page = await ctx.newPage();
  attachLogs(page, log);
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await board(page).waitFor({ state: 'visible', timeout: 30000 });
  await waitIdle(page);
  return page;
}

// ---------- locators (role + accessible name) ----------
export const board = (page) => page.getByRole('group', { name: '棋盘', exact: true });
export const tiles = (page) => board(page).getByRole('button');
export const stat = (page, name) => page.getByRole('status', { name, exact: true });
export const muteBtn = (page) => page.getByRole('button', { name: '静音', exact: true });
export const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });

export async function hud(page) {
  const read = async (n) => {
    const t = (await stat(page, n).textContent({ timeout: 5000 })) ?? '';
    const v = parseInt(t.trim(), 10);
    return Number.isFinite(v) ? v : NaN;
  };
  return { score: await read('当前分数'), target: await read('本关目标分数'), level: await read('当前关卡'), high: await read('历史最高分') };
}

export async function isBusy(page) {
  return (await board(page).getAttribute('aria-busy')) === 'true';
}

// Settled = animation over (aria-busy not true), or an end dialog is already shown: the product
// keeps aria-busy="true" on the board while the 过关/游戏结束 dialog is open, and that dialog only
// appears after the animation and the end pause, so the values are final at that point.
export async function waitIdle(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    if (!b) return false;
    if (b.getAttribute('aria-busy') !== 'true') return true;
    return [...document.querySelectorAll('[role="dialog"], dialog')].some((d) => {
      const n = d.getAttribute('aria-label') || '';
      return (n === '过关' || n === '游戏结束' || /过关|游戏结束/.test(d.textContent || '')) && d.checkVisibility && d.checkVisibility();
    });
  }, null, { timeout, polling: 30 });
}

// After an action: wait shortly for the animation to start, then for it to end. Returns whether it started.
export async function settle(page, startWait = 500) {
  const started = await page.waitForFunction(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    return b && b.getAttribute('aria-busy') === 'true';
  }, null, { timeout: startWait, polling: 20 }).then(() => true, () => false);
  await waitIdle(page);
  return started;
}

// ---------- board model ----------
const NAME_RE = /^(.)色方块，第(\d+)行第(\d+)列$/;
// snapshot: { cells: Map "r,c" -> {color, r, c, x, y, w, h, name} }
export async function readBoard(page) {
  const items = await tiles(page).evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { name: e.getAttribute('aria-label') || e.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }));
  const cells = new Map();
  for (const it of items) {
    const m = NAME_RE.exec((it.name || '').trim());
    if (!m) continue;
    const r = +m[2], c = +m[3];
    cells.set(`${r},${c}`, { color: m[1], r, c, x: it.x, y: it.y, w: it.w, h: it.h, name: it.name.trim() });
  }
  return { cells };
}

export function key(r, c) { return `${r},${c}`; }
export function serialize(snap) {
  return [...snap.cells.values()].map((t) => `${t.r},${t.c}:${t.color}`).sort().join('|');
}
export function colorsOf(snap) { return new Set([...snap.cells.values()].map((t) => t.color)); }
export function dims(snap) {
  let R = 0, C = 0;
  for (const t of snap.cells.values()) { R = Math.max(R, t.r); C = Math.max(C, t.c); }
  return { R, C };
}

export function groupAt(snap, r, c) {
  const s = snap.cells.get(key(r, c));
  if (!s) return [];
  const seen = new Set([key(r, c)]);
  const out = [];
  const stack = [[r, c]];
  while (stack.length) {
    const [a, b] = stack.pop();
    out.push([a, b]);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(a + dr, b + dc);
      const t = snap.cells.get(k);
      if (t && !seen.has(k) && t.color === s.color) { seen.add(k); stack.push([a + dr, b + dc]); }
    }
  }
  return out;
}

export function allGroups(snap) {
  const seen = new Set();
  const groups = [];
  for (const t of snap.cells.values()) {
    const k = key(t.r, t.c);
    if (seen.has(k)) continue;
    const g = groupAt(snap, t.r, t.c);
    g.forEach(([a, b]) => seen.add(key(a, b)));
    groups.push({ cells: g, color: t.color, size: g.length });
  }
  return groups;
}
export const removable = (snap) => allGroups(snap).filter((g) => g.size >= 2);
export const singles = (snap) => allGroups(snap).filter((g) => g.size === 1);

// Predict the board after removing the group (§1.3). R = number of rows (bottom row index).
// Returns { snap, map } where map: old "r,c" -> new "r,c" for surviving tiles.
export function predict(snap, group, R) {
  const rm = new Set(group.map(([a, b]) => key(a, b)));
  const { C } = dims(snap);
  const cols = [];
  for (let c = 1; c <= C; c++) {
    const col = [];
    for (let r = R; r >= 1; r--) {
      const t = snap.cells.get(key(r, c));
      if (t && !rm.has(key(r, c))) col.push(t);
    }
    if (col.length) cols.push(col);
  }
  const cells = new Map();
  const map = new Map();
  cols.forEach((col, i) => col.forEach((t, j) => {
    const nr = R - j, nc = i + 1;
    cells.set(key(nr, nc), { ...t, r: nr, c: nc });
    map.set(key(t.r, t.c), key(nr, nc));
  }));
  return { snap: { cells }, map };
}

export function nonEmptyCols(snap) { return new Set([...snap.cells.values()].map((t) => t.c)); }

// Columns that become empty by removing the group, and whether a non-empty column lies to their right.
export function emptiedColumns(snap, group) {
  const rm = new Set(group.map(([a, b]) => key(a, b)));
  const before = nonEmptyCols(snap);
  const emptied = [];
  for (const c of before) {
    const left = [...snap.cells.values()].filter((t) => t.c === c && !rm.has(key(t.r, t.c)));
    if (!left.length) emptied.push(c);
  }
  const maxC = Math.max(...before);
  return { emptied: emptied.sort((a, b) => a - b), maxC, hasRight: emptied.some((c) => c < maxC && [...before].some((x) => x > c && !emptied.includes(x))) };
}

export async function clickCell(page, snap, r, c, how = 'mouse') {
  const t = snap.cells.get(key(r, c));
  if (!t) throw new Error(`no tile at ${r},${c}`);
  const loc = board(page).getByRole('button', { name: t.name, exact: true });
  if (how === 'tap') await loc.tap({ timeout: 5000 });
  else await loc.click({ timeout: 5000 });
}

export async function anyDialog(page) {
  return { cleared: await dialog(page, '过关').isVisible(), over: await dialog(page, '游戏结束').isVisible() };
}

export async function waitDialog(page, timeout = 6000) {
  const t0 = now();
  while (now() - t0 < timeout) {
    const d = await anyDialog(page);
    if (d.cleared || d.over) return d;
    await sleep(100);
  }
  return { cleared: false, over: false };
}

export async function highlightedNames(page) {
  return tiles(page).evaluateAll((els) => els.filter((e) => e.getAttribute('data-state') === 'highlighted').map((e) => e.getAttribute('aria-label')));
}

export async function tileStyle(page, name) {
  return board(page).getByRole('button', { name, exact: true }).evaluate((e) => {
    const s = getComputedStyle(e);
    return [s.filter, s.transform, s.boxShadow, s.backgroundColor, s.backgroundImage, s.outline, s.opacity, s.borderColor, s.scale, s.zIndex].join(' ; ');
  });
}

// Horizontal layout checks (testability contract, AC-15).
export async function layoutCheck(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth, vh = window.innerHeight;
    const b = document.querySelector('[role="group"][aria-label="棋盘"]').getBoundingClientRect();
    window.scrollTo(100, 0);
    const sx = window.scrollX;
    window.scrollTo(0, window.scrollY);
    const tilesOut = [...document.querySelectorAll('[role="group"][aria-label="棋盘"] button')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.left < -0.5 || r.right > vw + 0.5;
    }).length;
    const docH = de.scrollHeight;
    return {
      scrollWidth: de.scrollWidth, clientWidth: vw, scrollXAfter: sx, boardLeft: b.left, boardRight: b.right,
      boardWidth: b.width, boardTop: b.top + window.scrollY, boardBottom: b.bottom + window.scrollY, docH, vh, tilesOut,
      ok: de.scrollWidth <= vw && sx === 0 && b.left >= -0.5 && b.right <= vw + 0.5 && tilesOut === 0 && b.top + window.scrollY >= -0.5 && b.bottom + window.scrollY <= docH + 0.5,
    };
  });
}

export async function visibleAll(page) {
  const names = ['当前分数', '本关目标分数', '当前关卡', '历史最高分'];
  const out = {};
  for (const n of names) out[n] = await stat(page, n).isVisible();
  out['静音'] = await muteBtn(page).isVisible();
  return out;
}

export async function shot(page, name) {
  const f = `${name}.png`;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, f) }).catch(() => {});
  return f;
}
export function writeEvidence(name, data) {
  fs.writeFileSync(path.join(EVIDENCE_DIR, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return name;
}

// Choose the largest group of a given property, etc.
export const bySize = (gs) => [...gs].sort((a, b) => a.size - b.size);
export const centerOf = (snap, [r, c]) => { const t = snap.cells.get(key(r, c)); return { x: t.x, y: t.y }; };
