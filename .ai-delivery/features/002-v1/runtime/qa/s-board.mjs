// TS-27, TS-29, TS-34
import * as L from './lib.mjs';
import { withPage, skip, fmtHud, pressDialogButton, endButtonOf } from './common.mjs';
import { sampledInvalid } from './s-input.mjs';

const T27 = async (rec) => {
  const st = { n: 0, noMove: [], withLine: [], starts: 0 };
  const check = (B, where) => {
    st.n++;
    const mv = L.allMoves(B.g).length;
    if (mv === 0) st.noMove.push(where);
    if (L.lines(B.g).length) st.withLine.push(where);
  };
  await Promise.all([1, 6].map((lv) => withPage(rec, { storage: { 'swap-match.level': lv }, tag: `level${lv}` }, async (page) => {
    check(await L.readBoard(page), `第 ${lv} 关开局`); st.starts++;
    for (let i = 0; i < 70 && st.n < 110; i++) {
      const s = await L.play(page, { pick: i % 3 ? L.randomPick : L.weak, how: 'gesture' });
      if (s.none) { st.noMove.push(`上下文 ${lv} #${i + 1}`); await L.sleep(500); continue; }
      if (s.dlg) {
        await pressDialogButton(page, endButtonOf(s.dlg.name));
        const h = await L.hud(page);
        check(await L.readBoard(page), `第 ${h.level} 关开始（上下文 ${lv}）`); st.starts++;
        continue;
      }
      check(s.A, `上下文 ${lv} #${i + 1}（${fmtHud(s.h1)}）`);
    }
  })));
  if (st.n < 100) skip(`只收集到 ${st.n} 个静止棋盘`);
  rec.cp('1 每关开始时及每个静止棋盘上至少存在一处可交换位置', st.noMove.length === 0, `${st.n} 个静止棋盘（含 ${st.starts} 个关卡开局）${st.noMove.length ? '；没有可交换位置：' + st.noMove.join('；') : '都至少有一处可交换位置'}`);
  rec.cp('2 静止棋盘上没有 3 个及以上同色一线', st.withLine.length === 0, st.withLine.length ? '有一线：' + st.withLine.join('；') : `${st.n} 个静止棋盘都没有一线`);
  rec.log.push('检查点 3：未识别到洗牌，不报告');
};

async function hintCells(page) {
  return page.evaluate(() => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    return [...b.querySelectorAll('button')].filter((e) => {
      if (e.getAttribute('data-state') === 'hint') return true;
      const ids = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      return ids.some((id) => { const d = document.getElementById(id); return d && d.textContent.trim() === '可交换提示'; });
    }).map((e) => (e.getAttribute('aria-label') || '').trim());
  });
}
const posOf = (name) => { const m = /第(\d+)行第(\d+)列$/.exec(name); return m ? [+m[1] - 1, +m[2] - 1] : null; };

const T29 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const s0 = await L.play(page, { how: 'gesture' });
      if (s0.none || s0.dlg) skip('开局交换未能进行');
      const t0 = Date.now();
      await L.sleep(3700 - (Date.now() - t0));
      const h4 = await hintCells(page);
      rec.cp(`${tag} 1 静止后不操作 4 秒：没有提示`, h4.length === 0, h4.length ? `已有提示：${h4.join('、')}` : '无提示方块');
      await L.sleep(6000 - (Date.now() - t0));
      const h6 = await hintCells(page);
      const B = await L.readBoard(page);
      const ps = h6.map(posOf);
      let valid = false;
      if (ps.length === 2 && ps.every(Boolean)) {
        const [a, b] = ps;
        const adj = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
        valid = adj && !!L.evalSwap(B.g, a, b);
      }
      rec.ev(await L.shot(page, `TS-29-${mobile ? 'mobile' : 'desktop'}-hint`));
      rec.cp(`${tag} 2 不操作到 6 秒：出现提示，所提示的是一处可交换位置`, valid, h6.length ? `提示方块：${h6.join('、')}；${valid ? '相邻且交换后构成有效交换' : '不构成一处可交换位置'}` : '6 秒时没有提示');
      if (!valid) return;
      const h0 = await L.hud(page);
      await L.gesture(page, B, ps[0], ps[1]);
      await L.sleep(80);
      const during = await hintCells(page);
      await L.settle(page); await L.sleep(300);
      const h1 = await L.hud(page);
      rec.cp(`${tag} 3 按提示交换发生消除（不弹回），步数减 1，交换开始后提示消失`, h1.moves === h0.moves - 1 && h1.score > h0.score && during.length === 0,
        `${fmtHud(h0)} → ${fmtHud(h1)}；交换开始后提示方块 ${during.length ? during.join('、') : '无'}`);
      const t1 = Date.now();
      if (await L.dialogState(page)) return;
      await L.sleep(6000 - (Date.now() - t1));
      const again = await hintCells(page);
      const B2 = await L.readBoard(page);
      let pick = [0, 0];
      const hp = again.map(posOf).filter(Boolean);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!hp.some(([x, y]) => x === r && y === c)) { pick = [r, c]; r = 8; break; }
      await L.pressCell(page, B2, pick);
      await L.sleep(300);
      const after = await hintCells(page);
      rec.cp(`${tag} 4 新棋盘静止 6 秒后提示再次出现，点选一个方块后提示消失`, again.length > 0 && after.length === 0,
        `6 秒时提示：${again.join('、') || '无'}；点选 ${L.P(...pick)} 后提示：${after.join('、') || '无'}`);
    });
  }
};

const T34 = async (rec) => withPage(rec, {}, async (page) => {
  // valid swap with a horizontal 3-line not in the top row (so tiles above fall)
  let B = await L.readBoard(page);
  let m = L.allMoves(B.g).find((x) => !x.rainbow && !x.specialInvolved && x.lines.length === 1 && x.n === 3 && x.lines[0].dir === 'h' && x.lines[0].cells[0][0] >= 2);
  if (!m) m = L.allMoves(B.g).find((x) => !x.rainbow && !x.specialInvolved && x.n === 3);
  if (!m) skip('没有找到合适的有效交换');
  const ln = m.lines[0].cells;
  const above = [];
  for (const [r, c] of ln) for (let rr = 0; rr < r; rr++) if (!ln.some(([x, y]) => x === rr && y === c)) above.push([rr, c]);
  // the line cells hold, after the swap, tiles that started at a/b: tag by start position
  const startOfLineCell = ([r, c]) => (r === m.a[0] && c === m.a[1] ? m.b : r === m.b[0] && c === m.b[1] ? m.a : [r, c]);
  await L.startSampler(page, 30);
  await L.sleep(120);
  const ids = await L.tagCells(page, B, [m.a, m.b, ...ln.map(startOfLineCell), ...above]);
  const [ia, ib] = ids;
  const lineIds = ids.slice(2, 2 + ln.length);
  const aboveIds = ids.slice(2 + ln.length);
  const firstIds = new Set();
  await L.gesture(page, B, m.a, m.b);
  await L.settle(page); await L.sleep(300);
  const frames = await L.stopSampler(page);
  frames[0].els.forEach((e) => firstIds.add(e[0]));
  const track = (id) => frames.map((f) => f.els.find((e) => String(e[0]) === String(id))).filter(Boolean);
  const between = (v, a, b) => Math.min(a, b) + 2 < v && v < Math.max(a, b) - 2;
  // 1 swap
  const sw = [[ia, m.a, m.b], [ib, m.b, m.a]].map(([id, from, to]) => {
    const tr = track(id); const t = B.g[from[0]][from[1]];
    const x0 = tr[0][1], y0 = tr[0][2], x1 = x0 + (to[1] - from[1]) * t.w, y1 = y0 + (to[0] - from[0]) * t.h;
    const mid = tr.some((e) => (from[0] === to[0] ? between(e[1], x0, x1) : between(e[2], y0, y1)));
    return { mid, n: tr.length };
  });
  rec.cp('1 交换：两方块在原位与目标位之间出现至少一个中间位置', sw.every((x) => x.mid), `${L.P(...m.a)}↔${L.P(...m.b)}：${sw.map((x, i) => `方块${i + 1} ${x.mid ? '有' : '无'}中间位置（${x.n} 帧）`).join('，')}`);
  // 3 removal
  const rm = lineIds.map((id) => track(id).some((e) => (e[3] > 0.05 && e[3] < 0.95) || (e[4] > 0.05 && e[4] < 0.95)));
  rec.cp('3 消除：被消除方块消失前出现介于完全显示与消失之间的中间状态', rm.some(Boolean), `一线 ${ln.map((x) => L.P(...x)).join('、')}：${rm.map((x) => (x ? '有' : '无')).join('/')} 透明度或大小中间状态`);
  // 4 fall + refill
  const fallMid = aboveIds.filter((id) => { const tr = track(id); if (tr.length < 2) return false; const y0 = tr[0][2], y1 = tr[tr.length - 1][2]; return y1 > y0 + 5 && tr.some((e) => between(e[2], y0, y1)); }).length;
  const fresh = [...new Set(frames.flatMap((f) => f.els.map((e) => e[0])))].filter((id) => !firstIds.has(id));
  const freshMid = fresh.filter((id) => { const tr = track(id); if (tr.length < 3) return false; const ys = tr.map((e) => e[2]); const y1 = ys[ys.length - 1]; const y0 = Math.min(...ys); return y1 > y0 + 5 && ys.some((y) => between(y, y0, y1)); }).length;
  rec.cp('4 下落与补充：下落方块与顶部新方块出现中间位置', (aboveIds.length === 0 || fallMid > 0) && freshMid > 0, `上方下落方块 ${aboveIds.length} 个，其中有中间位置 ${fallMid} 个；新出现方块 ${fresh.length} 个，其中有中间位置 ${freshMid} 个`);
  // 5 float
  const fl = frames.filter((f) => f.floats.some((t) => /^\+\d+$/.test(t.replace(/\s/g, '')))).length;
  rec.cp('5 加分：出现“+数字”浮字，且至少两次采样可读到', fl >= 2, `${frames.length} 帧中 ${fl} 帧可读到浮字`);
  // 2 bounce
  B = await L.readBoard(page);
  const inv = L.invalidPairs(B.g);
  if (!inv.length) return;
  const s = await sampledInvalid(page, B, inv[0].a, inv[0].b, 'gesture');
  rec.cp('2 弹回：出现离开原位的中间位置后回到原位', s.moved && s.back, `${L.P(...inv[0].a)}↔${L.P(...inv[0].b)}：${s.info}`);
});

export default [
  { id: 'TS-27', title: '静止棋盘总有可交换位置', fn: T27 },
  { id: 'TS-29', title: '5 秒无操作提示一处可交换位置', fn: T29 },
  { id: 'TS-34', title: '交换、弹回、消除、下落、补充、加分都有连续动画', fn: T34 },
];
