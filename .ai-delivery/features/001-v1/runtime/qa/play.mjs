// Shared play helpers: one removal with full bookkeeping, animation sampling, level-end detection.
import {
  readBoard, hud, removable, predict, serialize, clickCell, settle, audioCounts, waitDialog, anyDialog,
  dims, key, board, sleep,
} from './lib.mjs';

// Start an in-page requestAnimationFrame sampler of every tile element, the score text and body text.
export async function startSampler(page) {
  await page.evaluate(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    const els = [...b.querySelectorAll('button')];
    const scoreEl = document.querySelector('[role="status"][aria-label="当前分数"]');
    const S = { els, init: els.map((e) => { const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height }; }), frames: [], run: true, extra: [] };
    window.__qaS = S;
    const seen = new Set(els);
    const tick = () => {
      if (!S.run) return;
      const f = { t: performance.now(), tiles: els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.isConnected, x: r.x, y: r.y, w: r.width, h: r.height, op: +getComputedStyle(e).opacity }; }), score: scoreEl && scoreEl.textContent, text: document.body.textContent };
      // elements added during the animation (e.g. ghosts / floating text)
      const now = [...b.querySelectorAll('*')].filter((e) => !seen.has(e));
      f.added = now.map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, text: e.textContent, op: +getComputedStyle(e).opacity, w: r.width, h: r.height }; });
      S.frames.push(f);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
export async function stopSampler(page) {
  return page.evaluate(() => {
    const S = window.__qaS; S.run = false;
    const fin = S.els.map((e) => { const r = e.getBoundingClientRect(); return { c: e.isConnected, name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height }; });
    return { init: S.init, fin, frames: S.frames };
  });
}

const strictlyBetween = (v, a, b, eps = 1) => v > Math.min(a, b) + eps && v < Math.max(a, b) - eps;

// Analyse a sample: removed tiles (names in removedNames), moved tiles vertical / horizontal.
export function analyseSample(sample, removedNames, scoreBefore, scoreAfter, gain) {
  const res = { frames: sample.frames.length, removeMid: false, fallMid: false, shiftMid: false, scoreMid: false, plusText: false, fallers: 0, shifters: 0 };
  sample.init.forEach((ini, i) => {
    const fin = sample.fin[i];
    const isRemoved = removedNames.includes(ini.name);
    if (isRemoved) {
      for (const f of sample.frames) {
        const t = f.tiles[i];
        if (!t.c) break;
        if ((t.op > 0.02 && t.op < 0.98) || (t.w > 0.5 && t.w < ini.w - 1)) { res.removeMid = true; break; }
      }
      return;
    }
    if (!fin.c) return;
    const dy = Math.abs(fin.y - ini.y) > 2, dx = Math.abs(fin.x - ini.x) > 2;
    if (dy) res.fallers++;
    if (dx) res.shifters++;
    for (const f of sample.frames) {
      const t = f.tiles[i];
      if (dy && strictlyBetween(t.y, ini.y, fin.y)) res.fallMid = true;
      if (dx && strictlyBetween(t.x, ini.x, fin.x)) res.shiftMid = true;
    }
  });
  // ghost elements fading at removal
  if (!res.removeMid) {
    for (const f of sample.frames) if ((f.added || []).some((a) => a.tag === 'BUTTON' && a.op > 0.02 && a.op < 0.98)) { res.removeMid = true; break; }
  }
  for (const f of sample.frames) {
    const v = parseInt(f.score, 10);
    if (Number.isFinite(v) && v > scoreBefore && v < scoreAfter) res.scoreMid = true;
    if (f.text && f.text.includes(`+${gain}`)) res.plusText = true;
  }
  return res;
}

// Perform one removal of `group` (array of [r,c]) and verify against the prediction.
// Returns a rich info object; never throws on mismatch.
export async function removeGroup(page, st, group, opts = {}) {
  const before = opts.before || await readBoard(page);
  const R = st.R || dims(before).R;
  const h0 = await hud(page);
  const a0 = await audioCounts(page);
  const [r, c] = opts.clickCell || group[0];
  const removedNames = group.map(([a, b]) => before.cells.get(key(a, b)).name);
  if (opts.sample) await startSampler(page);
  await clickCell(page, before, r, c, opts.how || 'mouse');
  const busyStarted = await settle(page);
  let sample = null;
  if (opts.sample) sample = await stopSampler(page);
  const after = await readBoard(page);
  const h1 = await hud(page);
  const a1 = await audioCounts(page);
  const pred = predict(before, group, R);
  const match = serialize(pred.snap) === serialize(after);
  const n = before.cells.size - after.cells.size;
  const gain = h1.score - h0.score;
  const info = { before, after, pred, match, n, gain, h0, h1, a0, a1, busyStarted, group, removedNames, sample: null };
  if (sample) info.sample = analyseSample(sample, removedNames, h0.score, h1.score, gain);
  st.moves = (st.moves || 0) + 1;
  if (st.trace) st.trace.push(`move#${st.moves} L${h0.level} click ${r},${c} size=${group.length} n=${n} gain=${gain} score ${h0.score}->${h1.score} target=${h1.target} high=${h1.high} match=${match} audio ${a0.start}->${a1.start}`);
  return info;
}

export function describeDiff(pred, after) {
  const p = new Set(serialize(pred).split('|')), a = new Set(serialize(after).split('|'));
  const missing = [...p].filter((x) => !a.has(x)).slice(0, 10), extra = [...a].filter((x) => !p.has(x)).slice(0, 10);
  return `预测有而实际无：${missing.join(' ') || '无'}；实际有而预测无：${extra.join(' ') || '无'}`;
}

export function fullBoardCheck(snap) {
  const { R, C } = dims(snap);
  let full = snap.cells.size === R * C && R > 0;
  const colors = new Set([...snap.cells.values()].map((t) => t.color));
  return { ok: full && colors.size >= 2, R, C, count: snap.cells.size, colors: colors.size };
}

export { anyDialog, waitDialog, removable, board, sleep };
