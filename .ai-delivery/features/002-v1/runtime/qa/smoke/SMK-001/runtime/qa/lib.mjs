// Driver layer: browser contexts, page operations, board reading and move calculation
// (test plan §1; locators and observation points from design.md "Interface 与契约" / "可测性约定").
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
export const { chromium } = require('playwright-core');

export const BASE_URL = (process.env.AIDH_SERVICE_WEB_URL || '').replace(/\/$/, '');
export const EVIDENCE_DIR = process.env.QA_EVIDENCE_DIR || path.join(process.cwd(), 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => Date.now();
export const SETTLE_MS = 20000;

// ---------- in-page instrumentation ----------
// Floats (.score-float) observer, audio wrapper; optional strict user-activation audio policy double.
const INSTRUMENT = (strict) => `(() => {
  const STRICT = ${strict ? 'true' : 'false'};
  const qa = { floats: [], starts: [], stops: 0, ctxs: [], resumes: [], cur: null };
  window.__qa = qa;
  const ACT = (e) => e.type === 'keydown' || e.type === 'mousedown' || e.type === 'touchend' || e.type === 'click'
    || (e.type === 'pointerdown' && e.pointerType === 'mouse') || (e.type === 'pointerup' && e.pointerType !== 'mouse');
  for (const t of ['keydown','mousedown','pointerdown','pointerup','touchend','click','touchstart','touchmove','pointermove']) {
    window.addEventListener(t, (e) => { qa.cur = { type: e.type, pointerType: e.pointerType, act: ACT(e) }; setTimeout(() => { qa.cur = null; }, 0); }, true);
    window.addEventListener(t, () => { qa.cur = null; }, false);
  }
  const RealAC = window.AudioContext || window.webkitAudioContext;
  if (RealAC) {
    const stateOf = new WeakMap();
    class QAC extends RealAC {
      constructor(...a) {
        super(...a);
        qa.ctxs.push(this);
        if (STRICT) {
          stateOf.set(this, 'suspended');
          const realResume = RealAC.prototype.resume;
          const self = this;
          Object.defineProperty(this, 'state', { get() { return stateOf.get(self); }, configurable: true });
          this.resume = function () {
            const inAct = !!(qa.cur && qa.cur.act);
            qa.resumes.push({ t: performance.now(), ev: qa.cur && qa.cur.type, inAct });
            if (inAct && stateOf.get(self) !== 'running') {
              stateOf.set(self, 'running');
              try { self.dispatchEvent(new Event('statechange')); } catch (e) {}
            }
            return realResume.call(self).catch(() => {});
          };
          const realSuspend = RealAC.prototype.suspend;
          this.suspend = function () { if (stateOf.get(self) === 'running') stateOf.set(self, 'suspended-by-app'); return realSuspend.call(self); };
        }
      }
    }
    window.AudioContext = QAC;
    if (window.webkitAudioContext) window.webkitAudioContext = QAC;
    const P = window.AudioScheduledSourceNode.prototype;
    const oStart = P.start, oStop = P.stop;
    P.start = function (...a) {
      const ctx = this.context;
      const st = ctx ? ctx.state : 'none';
      qa.starts.push({ t: performance.now(), state: st, audible: st === 'running' && !(STRICT && ctx && ctx.__qaMutedHint) });
      return oStart.apply(this, a);
    };
    P.stop = function (...a) { qa.stops++; return oStop.apply(this, a); };
    qa.dest = [];
    const oConn = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (t, ...a) { if (t && this.context && t === this.context.destination) qa.dest.push(this); return oConn.call(this, t, ...a); };
    // true when every node feeding the destination is a gain node currently at 0
    qa.outputMuted = () => qa.dest.length > 0 && qa.dest.every((n) => n instanceof GainNode && n.gain.value === 0);
  }
  const watch = () => {
    const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('score-float')) qa.floats.push({ t: performance.now(), text: (n.textContent || '').trim() });
    } });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
})();`;

// ---------- browser contexts ----------
let browser;
export async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  return browser;
}
export async function closeBrowser() { if (browser) await browser.close().catch(() => {}); browser = null; }

async function prep(ctx, { storage, strict } = {}) {
  if (storage && Object.keys(storage).length) {
    await ctx.addInitScript((s) => {
      // seed once per context (survives close/reopen within the context)
      try { if (!localStorage.getItem('__qaSeeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, String(v)); localStorage.setItem('__qaSeeded', '1'); } } catch (e) {}
    }, storage);
  }
  await ctx.addInitScript(INSTRUMENT(!!strict));
  return ctx;
}
export async function desktopContext(opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, locale: 'zh-CN' });
  return prep(ctx, opts);
}
export async function mobileContext(opts = {}) {
  const b = await getBrowser();
  const viewport = opts.viewport || { width: 390, height: 844 };
  const ctx = await b.newContext({
    viewport, screen: viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  });
  return prep(ctx, opts);
}
export const makeContext = (mobile, opts = {}) => (mobile ? mobileContext(opts) : desktopContext(opts));

export function attachLogs(page, log) {
  page.on('console', (m) => log.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
}

export async function openGame(ctx, log = [], { mobile = false } = {}) {
  const page = await ctx.newPage();
  page.__mobile = mobile;
  attachLogs(page, log);
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await board(page).waitFor({ state: 'visible', timeout: 30000 });
  await waitStill(page);
  await page.waitForFunction(() => document.querySelectorAll('[role="group"][aria-label="棋盘"] button').length === 64, null, { timeout: 20000 });
  // a person looks at the page briefly before the first touch/click
  await sleep(1200);
  return page;
}
export async function reopen(page, log = []) {
  const ctx = page.context();
  const mobile = page.__mobile;
  await page.close();
  return openGame(ctx, log, { mobile });
}

// ---------- locators ----------
export const board = (page) => page.getByRole('group', { name: '棋盘', exact: true });
export const tiles = (page) => board(page).getByRole('button');
export const stat = (page, name) => page.getByRole('status', { name, exact: true });
export const muteBtn = (page) => page.getByRole('button', { name: '静音', exact: true });
export const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });

export const HUD_NAMES = ['当前关卡', '本关得分', '本关目标分数', '剩余步数', '历史最高分'];
export async function hud(page) {
  const vals = await page.evaluate((names) => names.map((n) => {
    const el = [...document.querySelectorAll('[role="status"]')].find((e) => e.getAttribute('aria-label') === n);
    return el ? el.textContent.trim() : null;
  }), HUD_NAMES);
  const num = (s) => (s !== null && /^\d+$/.test(s) ? parseInt(s, 10) : NaN);
  return { level: num(vals[0]), score: num(vals[1]), target: num(vals[2]), moves: num(vals[3]), high: num(vals[4]) };
}

export async function dialogState(page) {
  return page.evaluate(() => {
    const ds = [...document.querySelectorAll('[role="dialog"], dialog')].filter((d) => d.checkVisibility && d.checkVisibility());
    const d = ds[0];
    if (!d) return null;
    const id = d.getAttribute('aria-labelledby');
    const name = d.getAttribute('aria-label') || (id && document.getElementById(id) ? document.getElementById(id).textContent.trim() : '');
    return { name, text: (d.innerText || '').replace(/\s+/g, ' ').trim() };
  });
}

// Still = board aria-busy="false" or a dialog shown (test plan §1).
const STILL_FN = () => {
  const b = document.querySelector('[role="group"][aria-label="棋盘"]');
  if (!b) return false;
  if (b.getAttribute('aria-busy') === 'false') return true;
  return [...document.querySelectorAll('[role="dialog"], dialog')].some((d) => d.checkVisibility && d.checkVisibility());
};
export async function waitStill(page, timeout = SETTLE_MS) {
  await page.waitForFunction(STILL_FN, null, { timeout, polling: 30 });
}
export async function isBusy(page) { return (await board(page).getAttribute('aria-busy')) === 'true'; }
export async function settle(page, startWait = 700) {
  const started = await page.waitForFunction(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    return b && b.getAttribute('aria-busy') === 'true';
  }, null, { timeout: startWait, polling: 20 }).then(() => true, () => false);
  await waitStill(page);
  return started;
}

// ---------- board model ----------
const NAME_RE = /^(?:(彩色消除方块)|(.)色(方块|横向消除方块|纵向消除方块))，第(\d+)行第(\d+)列$/;
const KIND = { 方块: 'normal', 横向消除方块: 'row', 纵向消除方块: 'col' };
export async function readBoard(page) {
  const items = await page.evaluate(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    return [...b.querySelectorAll('button')].map((e) => {
      const r = e.getBoundingClientRect();
      return { name: (e.getAttribute('aria-label') || '').trim(), pressed: e.getAttribute('aria-pressed'), state: e.getAttribute('data-state'), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    });
  });
  const g = Array.from({ length: 8 }, () => Array(8).fill(null));
  let count = 0, bad = [], dup = 0;
  for (const it of items) {
    const m = NAME_RE.exec(it.name);
    if (!m) { bad.push(it.name); continue; }
    const r = +m[4] - 1, c = +m[5] - 1;
    if (r < 0 || r > 7 || c < 0 || c > 7) { bad.push(it.name); continue; }
    if (g[r][c]) dup++;
    g[r][c] = { color: m[1] ? null : m[2], kind: m[1] ? 'rainbow' : KIND[m[3]], name: it.name, x: it.x, y: it.y, w: it.w, h: it.h, pressed: it.pressed, state: it.state };
    count++;
  }
  return { g, count, bad, dup, buttons: items.length };
}
// Grid from a list of accessible names (sampler frames). Returns null unless all 64 cells parse.
export function gridFromLabels(labels) {
  const g = Array.from({ length: 8 }, () => Array(8).fill(null));
  let n = 0;
  for (const l of labels) {
    const m = NAME_RE.exec((l || '').trim());
    if (!m) continue;
    const r = +m[4] - 1, c = +m[5] - 1;
    if (r < 0 || r > 7 || c < 0 || c > 7 || g[r][c]) continue;
    g[r][c] = { color: m[1] ? null : m[2], kind: m[1] ? 'rainbow' : KIND[m[3]], name: l };
    n++;
  }
  return n === 64 ? g : null;
}
// Distinct full boards seen in sampler frames, in time order.
export function boardsFromFrames(frames) {
  const out = [];
  let prev = '';
  for (const f of frames) {
    const g = gridFromLabels(f.els.map((e) => e[6]));
    if (!g) continue;
    const s = sig({ g });
    if (s !== prev) { out.push({ t: f.t, g, floats: f.floats }); prev = s; }
  }
  return out;
}
// Mean absolute pixel difference (0..255) between two PNG buffers, both scaled to 40x40 in the page.
export async function pixelDiff(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
    const data = async (s) => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const k = c.getContext('2d'); k.drawImage(await load(s), 0, 0, 40, 40); return k.getImageData(0, 0, 40, 40).data; };
    const [p, q] = [await data(x), await data(y)];
    let d = 0; for (let i = 0; i < p.length; i++) if (i % 4 !== 3) d += Math.abs(p[i] - q[i]);
    return d / (40 * 40 * 3);
  }, [a.toString('base64'), b.toString('base64')]);
}
export async function cellShot(page, t) {
  return page.screenshot({ clip: { x: t.x - t.w / 2, y: t.y - t.h / 2, width: t.w, height: t.h } });
}
export const full = (B) => B.count === 64 && B.buttons === 64 && B.dup === 0 && B.g.every((row) => row.every(Boolean));
export const sig = (B) => B.g.map((row) => row.map((t) => (t ? (t.kind === 'rainbow' ? '*' : t.color + t.kind[0]) : '_')).join(',')).join('/');
export const cellSig = (t) => (t ? (t.kind === 'rainbow' ? '*' : t.color + t.kind[0]) : '_');
export const colorsOf = (B) => new Set(B.g.flat().filter((t) => t && t.color).map((t) => t.color));
export const special = (t) => t && t.kind !== 'normal';
export const P = (r, c) => `第${r + 1}行第${c + 1}列`;

// Runs of >=3 same color in rows/columns. Grid of cells with .color (null = rainbow, never matches).
export function lines(g) {
  const out = [];
  for (let r = 0; r < 8; r++) {
    let c = 0;
    while (c < 8) {
      const col = g[r][c] && g[r][c].color; let e = c + 1;
      while (col && e < 8 && g[r][e] && g[r][e].color === col) e++;
      if (col && e - c >= 3) out.push({ dir: 'h', color: col, cells: Array.from({ length: e - c }, (_, i) => [r, c + i]) });
      c = col ? e : c + 1;
    }
  }
  for (let c = 0; c < 8; c++) {
    let r = 0;
    while (r < 8) {
      const col = g[r][c] && g[r][c].color; let e = r + 1;
      while (col && e < 8 && g[e][c] && g[e][c].color === col) e++;
      if (col && e - r >= 3) out.push({ dir: 'v', color: col, cells: Array.from({ length: e - r }, (_, i) => [r + i, c]) });
      r = col ? e : r + 1;
    }
  }
  return out;
}
export function swapped(g, a, b) {
  const h = g.map((row) => row.slice());
  const t = h[a[0]][a[1]]; h[a[0]][a[1]] = h[b[0]][b[1]]; h[b[0]][b[1]] = t;
  return h;
}
const touches = (ln, a, b) => ln.cells.some(([r, c]) => (r === a[0] && c === a[1]) || (r === b[0] && c === b[1]));
// Evaluate swapping a<->b. Returns null if not a valid swap.
export function evalSwap(g, a, b) {
  const ta = g[a[0]][a[1]], tb = g[b[0]][b[1]];
  if (!ta || !tb) return null;
  const rainbow = (ta.kind === 'rainbow') !== (tb.kind === 'rainbow');
  const h = swapped(g, a, b);
  const ls = lines(h).filter((ln) => touches(ln, a, b));
  if (!ls.length && !rainbow) return null;
  const cells = new Set();
  ls.forEach((ln) => ln.cells.forEach(([r, c]) => cells.add(r * 8 + c)));
  const maxLen = ls.reduce((m, ln) => Math.max(m, ln.cells.length), 0);
  const dir = a[0] === b[0] ? (b[1] > a[1] ? 'right' : 'left') : (b[0] > a[0] ? 'down' : 'up');
  return { a, b, dir, lines: ls, n: cells.size, maxLen, rainbow, after: h, specialInvolved: special(ta) || special(tb) || ls.some((ln) => ln.cells.some(([r, c]) => special(h[r][c]))) };
}
export function allMoves(g) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (r2 > 7 || c2 > 7) continue;
      const m1 = evalSwap(g, [r, c], [r2, c2]);
      if (m1) { out.push(m1); out.push({ ...evalSwap(g, [r2, c2], [r, c]) }); }
    }
  }
  return out;
}
export const strong = (ms) => [...ms].sort((x, y) => (y.n + (y.rainbow ? 20 : 0)) - (x.n + (x.rainbow ? 20 : 0)) || y.maxLen - x.maxLen)[0];
export const weak = (ms) => {
  const plain = ms.filter((m) => !m.rainbow && !m.specialInvolved);
  const pool = plain.length ? plain : ms;
  return [...pool].sort((x, y) => x.n - y.n || x.maxLen - y.maxLen || Math.random() - 0.5)[0];
};
export const randomPick = (ms) => ms[Math.floor(Math.random() * ms.length)];
export function invalidPairs(g) {
  const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc;
    if (r2 > 7 || c2 > 7) continue;
    if (g[r][c].kind === 'rainbow' || g[r2][c2].kind === 'rainbow') continue;
    if (!evalSwap(g, [r, c], [r2, c2])) out.push({ a: [r, c], b: [r2, c2] });
  }
  return out;
}

// ---------- input ----------
async function cdp(page) {
  if (!page.__cdp) page.__cdp = await page.context().newCDPSession(page);
  return page.__cdp;
}
export async function touchSwipe(page, x1, y1, x2, y2, steps = 8) {
  const s = await cdp(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, id: 1 }] });
    await sleep(12);
  }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export async function touchTap(page, x, y) {
  const s = await cdp(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(40);
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export async function mouseDrag(page, x1, y1, x2, y2, steps = 8) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps); await sleep(10); }
  await page.mouse.up();
}
export async function mouseClick(page, x, y) { await page.mouse.click(x, y); }

// Press a cell with the page's own input kind (mouse on desktop, touch on mobile).
export async function pressCell(page, B, [r, c]) {
  const t = B.g[r][c];
  if (page.__mobile) await touchTap(page, t.x, t.y); else await mouseClick(page, t.x, t.y);
}
// Gesture from cell a towards b (b may be outside the board: pass direction vector via {dr,dc}).
export async function gesture(page, B, a, b) {
  const t = B.g[a[0]][a[1]];
  const dx = (b[1] - a[1]) * t.w, dy = (b[0] - a[0]) * t.h;
  if (page.__mobile) await touchSwipe(page, t.x, t.y, t.x + dx * 0.9, t.y + dy * 0.9);
  else await mouseDrag(page, t.x, t.y, t.x + dx * 0.9, t.y + dy * 0.9);
}
// how: 'gesture' (drag/swipe) | 'select' (two clicks/taps)
export async function doSwap(page, B, a, b, how = 'gesture') {
  if (how === 'select') { await pressCell(page, B, a); await sleep(120); await pressCell(page, B, b); } else await gesture(page, B, a, b);
}

export async function floatsCount(page) { return page.evaluate(() => window.__qa.floats.length); }
export async function floatsSince(page, i) { return page.evaluate((k) => window.__qa.floats.slice(k), i); }
export async function audio(page) {
  return page.evaluate(() => ({ starts: window.__qa.starts.slice(), stops: window.__qa.stops, resumes: window.__qa.resumes.slice(), ctxStates: window.__qa.ctxs.map((c) => c.state), outMuted: window.__qa.outputMuted ? window.__qa.outputMuted() : false, now: performance.now() }));
}

// One move: read board, choose with picker, swap, settle. Returns record.
export async function play(page, { pick = strong, how = 'gesture', filter } = {}) {
  const B = await readBoard(page);
  let ms = allMoves(B.g);
  if (filter) ms = ms.filter(filter);
  if (!ms.length) return { none: true, B };
  const m = pick(ms);
  const h0 = await hud(page);
  const f0 = await floatsCount(page);
  await doSwap(page, B, m.a, m.b, how);
  const started = await settle(page);
  await sleep(60);
  let dlg = await dialogState(page);
  let h1 = await hud(page);
  if (!dlg && (h1.score >= h1.target || h1.moves === 0)) {
    for (let i = 0; i < 30 && !dlg; i++) { await sleep(100); dlg = await dialogState(page); }
    h1 = await hud(page);
  }
  const floats = await floatsSince(page, f0);
  const A = await readBoard(page);
  return { m, B, A, h0, h1, floats, gains: floats.map((f) => parseInt(f.text.replace(/[^\d]/g, ''), 10)), dlg, started };
}
export async function playToEnd(page, opts = {}, cap = 40, onStep) {
  const trace = [];
  for (let i = 0; i < cap; i++) {
    const s = await play(page, opts);
    if (s.none) { trace.push('无可交换位置'); await sleep(500); continue; }
    trace.push(`${s.m.dir}${P(...s.m.a)} n=${s.m.n} hud ${JSON.stringify(s.h1)} floats ${s.gains.join('+')} ${s.dlg ? 'dialog ' + s.dlg.name : ''}`);
    if (onStep) await onStep(s, i);
    if (s.dlg) return { end: s.dlg.name, last: s, trace, steps: i + 1 };
  }
  return { end: null, trace };
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

// In-page sampler: records every button / float position, opacity and scale at an interval.
export async function startSampler(page, every = 30) {
  await page.evaluate((ms) => {
    let id = 0;
    const S = { frames: [] };
    window.__qaS = S;
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    S.timer = setInterval(() => {
      const fr = { t: performance.now(), els: [], floats: [] };
      for (const e of b.querySelectorAll('button')) {
        if (!e.dataset.qaid) e.dataset.qaid = String(++id);
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        let sc = 1;
        try { const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform); sc = Math.hypot(m.a, m.b); } catch (er) {}
        fr.els.push([+e.dataset.qaid, Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, +cs.opacity, Math.round(sc * 1000) / 1000, Math.round(r.width * 10) / 10, e.getAttribute('aria-label')]);
      }
      for (const f of document.querySelectorAll('.score-float')) fr.floats.push((f.textContent || '').trim());
      S.frames.push(fr);
    }, ms);
  }, every);
}
export async function tagCells(page, B, cells) {
  return page.evaluate((labels) => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    const out = [];
    for (const l of labels) { const e = [...b.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === l); out.push(e ? (e.dataset.qaid || '') : ''); }
    return out;
  }, cells.map(([r, c]) => B.g[r][c].name));
}
export async function stopSampler(page) {
  return page.evaluate(() => { clearInterval(window.__qaS.timer); return window.__qaS.frames; });
}
