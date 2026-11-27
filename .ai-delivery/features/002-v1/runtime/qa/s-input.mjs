// TS-04, TS-05, TS-06, TS-07, TS-08, TS-09, TS-11
import * as L from './lib.mjs';
import { withPage, skip, fmtHud, pressedNames } from './common.mjs';

const DIRS = ['up', 'down', 'left', 'right'];
const DIR_CN = { up: '上', down: '下', left: '左', right: '右' };
const view = (page) => page.evaluate(() => ({ sx: window.scrollX, sy: window.scrollY, scale: window.visualViewport ? window.visualViewport.scale : 1 }));
export const sameMove = (m) => (x) => x.a[0] === m.a[0] && x.a[1] === m.a[1] && x.b[0] === m.b[0] && x.b[1] === m.b[1];

const fourDirs = (mobile) => async (rec) => withPage(rec, { mobile }, async (page) => {
  const done = {};
  let vp = null;
  for (let i = 0; i < 20 && Object.keys(done).length < 4; i++) {
    const B = await L.readBoard(page);
    const ms = L.allMoves(B.g);
    const want = DIRS.filter((d) => !done[d]);
    const cand = ms.filter((m) => want.includes(m.dir) && !m.rainbow);
    const m = cand.length ? cand[0] : L.randomPick(ms);
    if (!m) { await L.sleep(500); continue; }
    const h0 = await L.hud(page);
    const v0 = mobile ? await view(page) : null;
    await L.gesture(page, B, m.a, m.b);
    await L.settle(page);
    await L.sleep(300);
    const h1 = await L.hud(page);
    const A = await L.readBoard(page);
    if (mobile && !vp) { const v1 = await view(page); vp = { v0, v1 }; }
    if (cand.length) {
      const swappedOnly = L.sig({ g: m.after });
      done[m.dir] = { ok: h1.moves === h0.moves - 1 && h1.score > h0.score && L.sig(A) !== swappedOnly && L.sig(A) !== L.sig(B),
        o: `${DIR_CN[m.dir]}：${L.P(...m.a)}→${L.P(...m.b)}，${fmtHud(h0)} → ${fmtHud(h1)}，棋盘${L.sig(A) !== L.sig(B) ? '已变化' : '未变化'}` };
    }
    if (await L.dialogState(page)) break;
  }
  const miss = DIRS.filter((d) => !done[d]);
  if (miss.length) skip(`20 次有效交换内缺少方向：${miss.map((d) => DIR_CN[d]).join('')}（测试等待上限）`);
  for (const d of DIRS) rec.cp(`${mobile ? '滑动' : '拖动'}方向${DIR_CN[d]}：交换并消除，步数恰好减 1`, done[d].ok, done[d].o);
  if (mobile) rec.cp('在棋盘上滑动时页面滚动位置与缩放比例不变', vp && vp.v0.sx === vp.v1.sx && vp.v0.sy === vp.v1.sy && vp.v0.scale === vp.v1.scale, JSON.stringify(vp));
  rec.ev(await L.shot(page, `${rec.id}-end`));
});

const T06 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      for (const orient of ['横向', '纵向']) {
        const ok = (x) => !x.rainbow && (orient === '横向' ? x.a[0] === x.b[0] : x.a[1] === x.b[1]);
        let B = await L.readBoard(page);
        let m = L.allMoves(B.g).find(ok);
        for (let k = 0; k < 10 && !m; k++) { await L.play(page, { pick: L.randomPick }); B = await L.readBoard(page); m = L.allMoves(B.g).find(ok); }
        if (!m) skip(`没有找到${orient}相邻的有效交换`);
        const h0 = await L.hud(page);
        await L.pressCell(page, B, m.a);
        await L.sleep(300);
        const M = await L.readBoard(page);
        const h1 = await L.hud(page);
        const pn = pressedNames(M);
        rec.cp(`1 ${tag}${orient}：点第一个方块后显示选中，棋盘与步数不变`, pn.length === 1 && pn[0] === B.g[m.a[0]][m.a[1]].name && L.sig(M) === L.sig(B) && h1.moves === h0.moves && h1.score === h0.score,
          `点 ${L.P(...m.a)} 后选中：${pn.join('、') || '无'}；棋盘${L.sig(M) === L.sig(B) ? '不变' : '有变化'}；${fmtHud(h0)} → ${fmtHud(h1)}`);
        await L.pressCell(page, B, m.b);
        await L.settle(page);
        await L.sleep(300);
        const A = await L.readBoard(page);
        const h2 = await L.hud(page);
        rec.cp(`2 ${tag}${orient}：再点相邻方块后交换并消除，步数减 1，选中消失`, h2.moves === h0.moves - 1 && h2.score > h0.score && pressedNames(A).length === 0 && L.sig(A) !== L.sig(B),
          `点 ${L.P(...m.b)} 后 ${fmtHud(h2)}；选中：${pressedNames(A).join('、') || '无'}`);
      }
      rec.ev(await L.shot(page, `TS-06-${mobile ? 'mobile' : 'desktop'}`));
    });
  }
};

const T07 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const B = await L.readBoard(page);
      const h0 = await L.hud(page);
      const same = async () => { const A = await L.readBoard(page); const h = await L.hud(page); return { A, h, ok: L.sig(A) === L.sig(B) && h.moves === h0.moves && h.score === h0.score }; };
      const pairs = [['1 同一行隔一格', [2, 1], [2, 3]], ['2 同一列隔一格', [5, 1], [7, 1]], ['3 斜向相邻', [2, 5], [3, 6]]];
      for (const [name, p, q] of pairs) {
        await L.pressCell(page, B, p); await L.sleep(250);
        await L.pressCell(page, B, q); await L.sleep(700);
        await L.waitStill(page);
        const s = await same();
        const pn = pressedNames(s.A);
        const qn = s.A.g[q[0]][q[1]].name;
        rec.cp(`${tag} ${name}：不交换，棋盘、步数、得分不变`, s.ok, `${L.P(...p)} 与 ${L.P(...q)}；棋盘${L.sig(s.A) === L.sig(B) ? '不变' : '有变化'}；${fmtHud(h0)} → ${fmtHud(s.h)}`);
        rec.cp(`${tag} ${name}：选中改为后点的方块`, pn.length === 1 && pn[0] === qn, `选中：${pn.join('、') || '无'}（应为 ${qn}）`);
      }
      const p4 = [6, 4];
      await L.pressCell(page, B, p4); await L.sleep(250);
      await L.pressCell(page, B, p4); await L.sleep(700);
      const s4 = await same();
      rec.cp(`${tag} 4 点选后再点自己：选中取消，棋盘、步数不变`, s4.ok && pressedNames(s4.A).length === 0, `选中：${pressedNames(s4.A).join('、') || '无'}；${fmtHud(s4.h)}`);
      await L.gesture(page, B, [0, 4], [-1, 4]);
      await L.sleep(800);
      await L.waitStill(page);
      const s5 = await same();
      rec.cp(`${tag} 5 第一行方块向上${mobile ? '滑动' : '拖动'}：不交换，棋盘、步数、得分不变`, s5.ok, `棋盘${L.sig(s5.A) === L.sig(B) ? '不变' : '有变化'}；${fmtHud(s5.h)}`);
      const v = await L.play(page, { how: 'gesture' });
      rec.cp(`${tag} 之后有效交换仍正常并扣 1 步`, !v.none && v.h1.moves === v.h0.moves - 1 && v.h1.score > v.h0.score, v.none ? '无可交换位置' : `${fmtHud(v.h0)} → ${fmtHud(v.h1)}`);
    });
  }
};

const T08 = async (rec) => withPage(rec, {}, async (page) => {
  let n = 0;
  const plain3 = (x) => x.n === 3 && x.lines.length === 1 && x.maxLen === 3 && !x.specialInvolved && !x.rainbow;
  for (let i = 0; i < 30 && n < 5; i++) {
    const B = await L.readBoard(page);
    const m = L.allMoves(B.g).find(plain3);
    if (!m) { await L.play(page, { pick: L.randomPick }); continue; }
    const s = await L.play(page, { filter: sameMove(m), pick: (ms) => ms[0] });
    if (s.none) continue;
    if (s.dlg) break;
    n++;
    const swappedOnly = L.sig({ g: m.after });
    rec.cp(`#${n} 1 ${m.lines[0].cells.map((c) => L.P(...c)).join('、')} 的 3 个方块被消除`, L.sig(s.A) !== swappedOnly, `静止棋盘与“只交换不消除”的棋盘${L.sig(s.A) !== swappedOnly ? '不同' : '相同'}`);
    rec.cp(`#${n} 2 得分增加、步数恰好减 1`, s.h1.score > s.h0.score && s.h1.moves === s.h0.moves - 1, `${fmtHud(s.h0)} → ${fmtHud(s.h1)}`);
    const ls = L.lines(s.A.g);
    rec.cp(`#${n} 3 静止时没有 3 个及以上同色一线`, ls.length === 0 && L.full(s.A), ls.length ? JSON.stringify(ls) : '无一线，64 个方块齐全');
    await L.sleep(1000);
    const h2 = await L.hud(page);
    rec.cp(`#${n} 4 间隔 1 秒再读得分与步数不变`, h2.score === s.h1.score && h2.moves === s.h1.moves, `${fmtHud(s.h1)} / ${fmtHud(h2)}`);
  }
  if (!n) skip('没有找到恰好 3 个一线的普通交换');
  rec.ev(await L.shot(page, 'TS-08-end'));
});

// Sample the two tiles during an invalid swap; returns {moved, back, info}
export async function sampledInvalid(page, B, a, b, how) {
  await L.startSampler(page, 50);
  await L.sleep(120);
  const [ia, ib] = await L.tagCells(page, B, [a, b]);
  await L.doSwap(page, B, a, b, how);
  await L.sleep(900);
  await L.waitStill(page);
  await L.sleep(200);
  const frames = await L.stopSampler(page);
  const res = [];
  for (const [id, me, other] of [[ia, a, b], [ib, b, a]]) {
    const track = frames.map((f) => f.els.find((e) => String(e[0]) === id)).filter(Boolean);
    if (!track.length) { res.push({ moved: false, back: false, info: '采样中找不到该方块' }); continue; }
    const x0 = track[0][1], y0 = track[0][2];
    const t = B.g[me[0]][me[1]];
    const dx = (other[1] - me[1]) * t.w, dy = (other[0] - me[0]) * t.h;
    const prog = track.map((e) => ((e[1] - x0) * dx + (e[2] - y0) * dy) / (dx * dx + dy * dy));
    const maxP = Math.max(...prog);
    const last = track[track.length - 1];
    res.push({ moved: maxP > 0.05, back: Math.abs(last[1] - x0) < 1.5 && Math.abs(last[2] - y0) < 1.5, info: `最大朝对方位移比例 ${maxP.toFixed(2)}，结束偏差 ${(last[1] - x0).toFixed(1)},${(last[2] - y0).toFixed(1)}，${track.length} 帧` });
  }
  return { moved: res.every((x) => x.moved), back: res.every((x) => x.back), info: res.map((x) => x.info).join(' / ') };
}

async function clearSelection(page) {
  const A = await L.readBoard(page);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (A.g[r][c] && A.g[r][c].pressed === 'true') { await L.pressCell(page, A, [r, c]); await L.sleep(300); return; }
}

const T09 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const B0 = await L.readBoard(page);
      const inv = L.invalidPairs(B0.g);
      if (inv.length < 2) skip('棋盘上不足两对无效交换');
      const disjoint = (p) => ![p.a, p.b].some((c) => [inv[0].a, inv[0].b].some((d) => d[0] === c[0] && d[1] === c[1]));
      const pairs = [[inv[0], 'gesture'], [inv.find(disjoint) || inv[1], 'select']];
      for (const [p, how] of pairs) {
        const hn = how === 'gesture' ? (mobile ? '滑动' : '拖动') : '点选';
        for (let k = 1; k <= 3; k++) {
          const B = await L.readBoard(page);
          const h0 = await L.hud(page);
          const s = await sampledInvalid(page, B, p.a, p.b, how);
          const A = await L.readBoard(page);
          const h1 = await L.hud(page);
          rec.cp(`${tag}${hn}第 ${k} 次 1 动画中两方块离开原位朝对方移动后回到原位`, s.moved && s.back, `${L.P(...p.a)}↔${L.P(...p.b)}：${s.info}`);
          rec.cp(`${tag}${hn}第 ${k} 次 2 静止后棋盘完全相同，步数与得分不变`, L.sig(A) === L.sig(B) && h1.moves === h0.moves && h1.score === h0.score, `棋盘${L.sig(A) === L.sig(B) ? '相同' : '不同'}；${fmtHud(h0)} → ${fmtHud(h1)}`);
          if (how === 'select') await clearSelection(page);
        }
      }
      await clearSelection(page);
      const v = await L.play(page, { how: 'gesture' });
      rec.cp(`${tag} 3 之后的有效交换正常生效并扣 1 步`, !v.none && v.h1.moves === v.h0.moves - 1 && v.h1.score > v.h0.score, v.none ? '无' : `${fmtHud(v.h0)} → ${fmtHud(v.h1)}`);
    });
  }
};

const T11 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const B = await L.readBoard(page);
      const ms = L.allMoves(B.g);
      const m1 = L.strong(ms);
      const cells1 = new Set([m1.a, m1.b].map(([r, c]) => r * 8 + c));
      const m2 = ms.find((x) => !cells1.has(x.a[0] * 8 + x.a[1]) && !cells1.has(x.b[0] * 8 + x.b[1])) || { a: [7, 0], b: [7, 1] };
      const h0 = await L.hud(page);
      await L.gesture(page, B, m1.a, m1.b);
      await page.waitForFunction(() => document.querySelector('[role="group"][aria-label="棋盘"]').getAttribute('aria-busy') === 'true', null, { timeout: 2000, polling: 10 });
      await L.gesture(page, B, m2.a, m2.b);
      const busy1 = await L.isBusy(page);
      await L.pressCell(page, B, m2.a); await L.sleep(30); await L.pressCell(page, B, m2.b);
      const busy2 = await L.isBusy(page);
      await L.sleep(300);
      await L.waitStill(page);
      await L.sleep(300);
      const A = await L.readBoard(page);
      const h1 = await L.hud(page);
      await L.sleep(2000);
      const A2 = await L.readBoard(page);
      const h2 = await L.hud(page);
      rec.log.push(`${tag} 第二次操作时 aria-busy：拖动后 ${busy1}，点选后 ${busy2}`);
      rec.cp(`${tag}：动画中的第二次操作不生效，静止后剩余步数只少 1`, h1.moves === h0.moves - 1, `第一次 ${L.P(...m1.a)}→${L.P(...m1.b)}，动画中再操作 ${L.P(...m2.a)}↔${L.P(...m2.b)}（拖动与点选，操作时 aria-busy=${busy1}/${busy2}）；${fmtHud(h0)} → ${fmtHud(h1)}`);
      rec.cp(`${tag}：静止后再等 2 秒棋盘不再自行交换，步数不变`, L.sig(A2) === L.sig(A) && h2.moves === h1.moves && h2.score === h1.score, `2 秒后棋盘${L.sig(A2) === L.sig(A) ? '不变' : '有变化'}；${fmtHud(h2)}`);
    });
  }
};

export default [
  { id: 'TS-04', title: '电脑上用鼠标拖动交换，四个方向', fn: fourDirs(false) },
  { id: 'TS-05', title: '手机上用手指滑动交换，四个方向', fn: fourDirs(true) },
  { id: 'TS-06', title: '点选交换：先点一个、再点相邻一个', fn: T06 },
  { id: 'TS-07', title: '不相邻点选、斜向与越界拖动不交换', fn: T07 },
  { id: 'TS-08', title: '有效交换：一线消除、加分、扣 1 步', fn: T08 },
  { id: 'TS-09', title: '无效交换：弹回、棋盘不变、不扣步', fn: T09 },
  { id: 'TS-11', title: '动画进行中的交换操作不生效、不重复扣步', fn: T11 },
];
