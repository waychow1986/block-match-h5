// Short scenarios (each in its own fresh browser context, test plan §1.2).
import {
  BASE_URL, desktopContext, mobileContext, openGame, readBoard, hud, removable, singles, dims, key, serialize,
  board, muteBtn, dialog, stat, sleep, now, shot, clickCell, settle, waitIdle, isBusy, predict, groupAt,
  emptiedColumns, highlightedNames, tileStyle, layoutCheck, visibleAll, audioCounts, bySize, writeEvidence, attachLogs,
} from './lib.mjs';
import { removeGroup, describeDiff, fullBoardCheck, anyDialog, waitDialog } from './play.mjs';
import { Rec, run, finish } from './report.mjs';

const LEVEL_CAP_MS = 6 * 60 * 1000;
const ONLY = (process.env.QA_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(id);

// ---------- helpers ----------
async function fresh(kind, vp, log, opts = {}) {
  const ctx = kind === 'mobile' ? await mobileContext(vp) : await desktopContext(vp ? { viewport: vp } : {});
  if (opts.init) await ctx.addInitScript(opts.init);
  if (opts.before) await opts.before(ctx);
  const page = await openGame(ctx, log);
  await sleep(800);
  const snap = await readBoard(page);
  const st = { trace: [], R: dims(snap).R };
  return { ctx, page, st, snap, kind };
}

// Run a scenario with its own contexts; contexts are closed and the result written afterwards.
async function scenario(id, title, body, { defer = false } = {}) {
  if (!want(id)) return null;
  const envs = []; const log = [];
  const open = async (kind = 'desktop', vp, opts) => { const e = await fresh(kind, vp, log, opts); envs.push(e); return e; };
  const rec = await run(id, title, (r) => body(r, open, log), { page: () => envs.at(-1)?.page, defer: true });
  const traces = envs.flatMap((e) => e.st.trace);
  if (traces.length) rec.ev(writeEvidence(`${id}-trace.log`, traces.join('\n')));
  rec.log.push(...log);
  for (const e of envs) await e.ctx.close().catch(() => {});
  if (!defer) finish(rec);
  return rec;
}

const okRemoval = (i) => i.match && i.n === i.group.length && i.gain > 0;
const remObs = (i) => `消除 ${i.group.length} 个（点击 ${i.group[0]}），方块数减少 ${i.n}，分数 ${i.h0.score}→${i.h1.score}，棋盘符合预测 ${i.match}${i.match ? '' : '：' + describeDiff(i.pred.snap, i.after)}`;

async function state(page) { return { s: serialize(await readBoard(page)), h: await hud(page) }; }
// Observation window (§1.3): wait for any animation, then 2 s, then compare with the earlier state.
async function unchangedSince(page, s0, ms = 2000) {
  await waitIdle(page).catch(() => {});
  await sleep(ms);
  const s1 = await state(page);
  const d = await anyDialog(page);
  const same = s1.s === s0.s && s1.h.score === s0.h.score && s1.h.level === s0.h.level;
  return { same, dlg: d.cleared || d.over, obs: `棋盘${s1.s === s0.s ? '不变' : '改变'}，分数 ${s0.h.score}→${s1.h.score}，提示画面 ${JSON.stringify(d)}` };
}

const center = (snap, [r, c]) => { const t = snap.cells.get(key(r, c)); return { x: t.x, y: t.y }; };

// An empty cell inside the board range (above a shortened column).
function emptyCell(snap) {
  const ts = [...snap.cells.values()];
  let pitch = null;
  for (const t of ts) { const u = snap.cells.get(key(t.r + 1, t.c)); if (u) { pitch = u.y - t.y; break; } }
  if (!pitch) return null;
  const cols = [...new Set(ts.map((t) => t.c))];
  for (const c of cols) {
    const col = ts.filter((t) => t.c === c);
    const top = col.reduce((a, b) => (a.r < b.r ? a : b));
    if (top.r > 1) return { r: top.r - 1, c, x: top.x, y: top.y - pitch };
  }
  return null;
}

async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  return {
    down: (x, y) => send('touchStart', [{ x, y }]),
    move: async (x0, y0, x1, y1, steps = 6) => { for (let i = 1; i <= steps; i++) { await send('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }]); await sleep(30); } },
    up: () => send('touchEnd', []),
    cdp,
  };
}

// Point clearly outside the board but inside the viewport.
async function outsideBoard(page) {
  const b = await board(page).boundingBox();
  const vp = page.viewportSize();
  if (b.y > 30) return { x: b.x + b.width / 2, y: b.y - 15 };
  if (b.y + b.height + 30 < vp.height) return { x: b.x + b.width / 2, y: b.y + b.height + 15 };
  return { x: 3, y: 3 };
}

function hasTileAbove(snap, g) {
  const set = new Set(g.cells.map(([r, c]) => key(r, c)));
  return g.cells.some(([r, c]) => [...snap.cells.values()].some((t) => t.c === c && t.r < r && !set.has(key(t.r, t.c))));
}

export { LEVEL_CAP_MS, want, scenario, okRemoval, remObs, state, unchangedSince, center, emptyCell, touch, outsideBoard, hasTileAbove };

// ---------- AC-10 ----------
const H_PRESET = 99999999;
async function ts20() {
  await scenario('TS-20', '从未保存过时历史最高分为 0', async (rec, open) => {
    const { page } = await open();
    const h = await hud(page);
    rec.cp('1 全新上下文打开页面后历史最高分显示 0', h.high === 0, JSON.stringify(h));
  });
}

async function ts22() {
  await scenario('TS-22', '分数没有超过原最高分时不覆盖', async (rec, open, log) => {
    const e = await open('desktop', undefined, {
      before: async (ctx) => {
        const p = await ctx.newPage();
        await p.goto(BASE_URL + '/healthz');
        await p.evaluate((v) => localStorage.setItem('block-match.highScore', String(v)), H_PRESET);
        await p.close();
      },
    });
    let { page } = e;
    const h1 = await hud(page);
    rec.cp('1 预置 H 后打开页面，历史最高分显示 H', h1.high === H_PRESET, `H=${H_PRESET}，${JSON.stringify(h1)}`);
    const obs = [];
    for (let i = 0; i < 3; i++) {
      const s = await readBoard(page); const g = bySize(removable(s)).at(-1);
      const info = await removeGroup(page, e.st, g.cells, { before: s });
      obs.push(`分数 ${info.h1.score}，历史最高分 ${info.h1.high}`);
    }
    const h2 = await hud(page);
    rec.cp('2 消除若干次（分数远低于 H）后历史最高分仍为 H', h2.score > 0 && h2.high === H_PRESET, obs.join('；'));
    await page.close();
    page = await openGame(e.ctx, log);
    const h3 = await hud(page);
    rec.cp('3 关闭并重新打开后历史最高分仍为 H', h3.high === H_PRESET, JSON.stringify(h3));
  });
}

async function ts24() {
  await scenario('TS-24', '浏览器不允许本机保存时游戏仍可玩', async (rec, open, log) => {
    const init = () => {
      const fail = () => { throw new DOMException('storage blocked by test', 'SecurityError'); };
      Storage.prototype.getItem = fail; Storage.prototype.setItem = fail; Storage.prototype.removeItem = fail; Storage.prototype.clear = fail;
    };
    const e = await open('desktop', undefined, { init });
    const { page } = e;
    const h = await hud(page);
    const n = e.snap.cells.size;
    const alerts = await page.getByRole('alert').count() + await page.getByRole('alertdialog').count();
    const jsDlg = log.filter((l) => l.startsWith('[js-dialog')).length;
    const vis = await visibleAll(page);
    rec.cp('1 页面正常打开，棋盘与各项信息显示，不弹出错误提示', n > 0 && Object.values(vis).every(Boolean) && [h.score, h.target, h.level, h.high].every(Number.isFinite) && alerts === 0 && jsDlg === 0,
      `方块 ${n}，HUD ${JSON.stringify(h)}，可见 ${JSON.stringify(vis)}，alert ${alerts}，浏览器弹窗 ${jsDlg}`);
    rec.ev(await shot(page, 'TS-24-open'));
    const obs = []; let ok = true;
    for (let i = 0; i < 3; i++) {
      const s = await readBoard(page); const g = bySize(removable(s)).at(-1);
      const info = await removeGroup(page, e.st, g.cells, { before: s });
      if (!okRemoval(info) || !(info.h1.high >= info.h1.score)) ok = false;
      obs.push(`${remObs(info)}，历史最高分 ${info.h1.high}`);
    }
    const alerts2 = await page.getByRole('alert').count() + await page.getByRole('alertdialog').count() + log.filter((l) => l.startsWith('[js-dialog')).length;
    rec.cp('2 消除正常进行、分数增加；历史最高分不低于当前分数；没有错误提示', ok && alerts2 === 0, obs.join('；') + `；错误提示 ${alerts2}`);
  });
}

async function ts21() {
  await scenario('TS-21', '中途超过原最高分后关闭重开仍显示该最高分', async (rec, open, log) => {
    const e = await open();
    let { page } = e;
    for (let i = 0; i < 3; i++) {
      const s = await readBoard(page); const g = bySize(removable(s))[0];
      await removeGroup(page, e.st, g.cells, { before: s });
    }
    const X = (await hud(page)).score;
    await page.close();
    page = await openGame(e.ctx, log); await sleep(800);
    let h = await hud(page);
    rec.cp('1 第一次分数 X 后关闭重开：历史最高分 X；关卡 1、分数 0', X > 0 && h.high === X && h.level === 1 && h.score === 0, `X=${X}，重开后 ${JSON.stringify(h)}`);
    let Y = null; const t0 = now();
    while (now() - t0 < LEVEL_CAP_MS) {
      const s = await readBoard(page); const gs = removable(s);
      if (!gs.length) break;
      const info = await removeGroup(page, e.st, bySize(gs)[0].cells, { before: s });
      if (info.h1.score > X) {
        const d = await anyDialog(page);
        rec.cp('2 当前分数刚超过 X（仍在游戏中）时，历史最高分同步显示为当前分数', info.h1.high === info.h1.score && !d.cleared && !d.over, `X=${X}，当前分数 ${info.h1.score}，历史最高分 ${info.h1.high}，提示画面 ${JSON.stringify(d)}`);
        Y = (await hud(page)).score;
        break;
      }
    }
    if (Y === null) { rec.drop('本关结束前分数没有超过 X'); return; }
    await page.close();
    page = await openGame(e.ctx, log);
    h = await hud(page);
    rec.cp('3 紧接着关闭重开：历史最高分 = 关闭前最后的当前分数 Y（Y > X）', h.high === Y && Y > X, `X=${X}，Y=${Y}，重开后 ${JSON.stringify(h)}`);
    await page.close();
    page = await openGame(e.ctx, log);
    h = await hud(page);
    rec.cp('4 再一次关闭重开：历史最高分仍为 Y', h.high === Y, `Y=${Y}，${JSON.stringify(h)}`);
    const s = await readBoard(page); const g = bySize(removable(s))[0];
    await removeGroup(page, e.st, g.cells, { before: s });
    await page.reload({ waitUntil: 'load' });
    await board(page).waitFor({ state: 'visible' }); await waitIdle(page);
    h = await hud(page);
    rec.cp('5 刷新页面：历史最高分仍为 Y，关卡 1、分数 0', h.high === Y && h.level === 1 && h.score === 0, `Y=${Y}，刷新前先消除一次，刷新后 ${JSON.stringify(h)}`);
  });
}

export { ts20, ts21, ts22, ts24 };
