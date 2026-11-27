// TS-21, TS-22, TS-24, TS-25, TS-33
import * as L from './lib.mjs';
import { withPage, skip, pressDialogButton, fmtHud, levelParams } from './common.mjs';

const norm = (s) => (s || '').replace(/\s+/g, '');
// Does the visible dialog cover the board?
async function overlay(page) {
  return page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"], dialog')].find((x) => x.checkVisibility && x.checkVisibility());
    const b = document.querySelector('[role="group"][aria-label="棋盘"]');
    if (!d || !b) return { ok: false, o: '无 dialog 或棋盘' };
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const ok = !!top && (d.contains(top) || !b.contains(top));
    return { ok, o: `棋盘中心最上层元素${ok ? '不属于棋盘（被提示画面覆盖）' : '仍是棋盘方块'}` };
  });
}
// Try one swap on the board while a dialog is shown; returns before/after.
async function tryWhileDialog(page) {
  const B = await L.readBoard(page);
  const h0 = await L.hud(page);
  const ms = L.allMoves(B.g);
  const pair = ms.length ? [ms[0].a, ms[0].b] : [[0, 0], [0, 1]];
  const t = B.g[pair[0][0]][pair[0][1]], u = B.g[pair[1][0]][pair[1][1]];
  if (page.__mobile) {
    await L.touchSwipe(page, t.x, t.y, t.x + (u.x - t.x) * 0.9, t.y + (u.y - t.y) * 0.9);
    await L.sleep(300);
    await L.touchTap(page, t.x, t.y); await L.sleep(200); await L.touchTap(page, u.x, u.y);
  } else {
    await L.mouseDrag(page, t.x, t.y, t.x + (u.x - t.x) * 0.9, t.y + (u.y - t.y) * 0.9);
    await L.sleep(300);
    await L.mouseClick(page, t.x, t.y); await L.sleep(200); await L.mouseClick(page, u.x, u.y);
  }
  await L.sleep(1500);
  const A = await L.readBoard(page);
  const h1 = await L.hud(page);
  const d = await L.dialogState(page);
  const same = L.sig(A) === L.sig(B) && h1.score === h0.score && h1.moves === h0.moves;
  return { same, o: `尝试${page.__mobile ? '滑动与轻点' : '拖动与点选'} ${L.P(...pair[0])}↔${L.P(...pair[1])}：棋盘${L.sig(A) === L.sig(B) ? '不变' : '改变'}，${fmtHud(h0)} → ${fmtHud(h1)}，提示画面${d ? '仍在' : '已消失'}` };
}

const T21 = async (rec) => withPage(rec, {}, async (page) => {
  const bad1 = [], bad2 = [];
  const r = await L.playToEnd(page, { pick: L.strong, how: 'gesture' }, 40, async (s) => {
    const h = s.h1;
    if (s.dlg && h.score < h.target && h.moves > 0) bad1.push(`得分 ${h.score} < ${h.target}、步数 ${h.moves} 时出现“${s.dlg.name}”`);
    if (!s.dlg && h.score >= h.target) bad2.push(`得分 ${h.score} ≥ ${h.target} 时未出现提示画面`);
    if (s.dlg && s.dlg.name === '过关' && h.moves === 0) rec.log.push('补充证据（TS-23）：剩余步数 0 时出现过关画面');
  });
  rec.log.push(...r.trace);
  if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
  if (r.end === '本关失败') skip('本局未过关，出现“本关失败”，本场景不报告');
  rec.cp('1 得分低于目标且步数大于 0 的每次静止不出现提示画面', bad1.length === 0, `${r.steps} 次有效交换；${bad1.length ? bad1.join('；') : '未过关前都没有提示画面'}`);
  const h = await L.hud(page);
  const d = r.last.dlg;
  const ov = await overlay(page);
  rec.ev(await L.shot(page, 'TS-21-dialog'));
  const N = h.level;
  rec.cp('2 第一次静止时得分 ≥ 目标的交换之后出现“过关”画面，覆盖棋盘，显示第 N 关与本关得分 X', bad2.length === 0 && d.name === '过关' && norm(d.text).includes(`第${N}关`) && norm(d.text).includes(`本关得分${h.score}`) && ov.ok,
    `dialog“${d.name}”：${d.text}；信息栏 ${fmtHud(h)}；${ov.o}${bad2.length ? '；' + bad2.join('；') : ''}`);
  const t = await tryWhileDialog(page);
  rec.cp('3 过关画面显示期间交换不生效，剩余步数不换算成分数', t.same && (await L.hud(page)).score === h.score, t.o);
  await pressDialogButton(page, '下一关');
  const h2 = await L.hud(page);
  const ref = await levelParams(N + 1);
  const s = await L.play(page, { how: 'gesture' });
  rec.ev(await L.shot(page, 'TS-21-next'));
  rec.cp('4 点“下一关”后进入 N+1 关，得分 0，步数与目标等于该关全新打开时的值，可再次交换',
    h2.level === N + 1 && h2.score === 0 && h2.moves === ref.moves && h2.target === ref.target && !s.none && s.h1.moves === s.h0.moves - 1,
    `点击后 ${fmtHud(h2)}；全新上下文预置第 ${N + 1} 关：目标 ${ref.target}、步数 ${ref.moves}；再交换：${s.none ? '无可交换位置' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
});

const T22 = async (rec) => {
  await withPage(rec, {}, async (page) => {
    const h1 = await L.hud(page);
    rec.cp('1 全新上下文首次打开：第 1 关，得分 0', h1.level === 1 && h1.score === 0, fmtHud(h1));
    const r = await L.playToEnd(page, { pick: L.strong, how: 'gesture' }, 40);
    rec.log.push(...r.trace);
    if (r.end !== '过关') { rec.log.push(`40 次有效交换内未过关（${r.end || '无提示画面'}），检查点 2、3 不下结论`); return; }
    const ref = await levelParams(2);
    page = await L.reopen(page);
    const h2 = await L.hud(page);
    rec.ev(await L.shot(page, 'TS-22-reopen'));
    rec.cp('2 过关画面出现时直接关闭再打开：从第 2 关开始，得分 0，步数为该关限定步数', h2.level === 2 && h2.score === 0 && h2.moves === ref.moves,
      `重开后 ${fmtHud(h2)}；全新上下文预置第 2 关时步数 ${ref.moves}`);
    for (let i = 0; i < 2; i++) await L.play(page, { how: 'gesture' });
    const hm = await L.hud(page);
    page = await L.reopen(page);
    const h3 = await L.hud(page);
    rec.cp('3 交换 2 次后关闭再打开：仍是第 2 关，得分恢复 0，步数恢复为限定步数', h3.level === 2 && h3.score === 0 && h3.moves === ref.moves,
      `关闭前 ${fmtHud(hm)}；重开后 ${fmtHud(h3)}`);
  });
  await withPage(rec, { storage: { 'swap-match.level': 3 }, tag: 'level3' }, async (page) => {
    const h = await L.hud(page);
    rec.cp('4 预置 swap-match.level=3 打开显示第 3 关', h.level === 3, fmtHud(h));
  });
};

const T24 = async (rec) => withPage(rec, { mobile: true, storage: { 'swap-match.level': 5 } }, async (page) => {
  const start = await L.hud(page);
  const bad1 = [], neg = [];
  const r = await L.playToEnd(page, { pick: L.weak, how: 'gesture' }, 40, async (s) => {
    if (s.dlg && s.dlg.name === '本关失败' && s.h1.moves > 0) bad1.push(`步数 ${s.h1.moves} 时出现“本关失败”`);
    if (!(s.h1.moves >= 0)) neg.push(String(s.h1.moves));
  });
  rec.log.push(...r.trace);
  if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
  if (r.end === '过关') skip('本局出现“过关”，本场景不报告');
  rec.cp('1 剩余步数大于 0 的每次静止不出现“本关失败”', bad1.length === 0, `${r.steps} 次有效交换（进入本关时 ${fmtHud(start)}）；${bad1.length ? bad1.join('；') : '步数用完前都没有失败画面'}`);
  const h = await L.hud(page);
  const d = r.last.dlg;
  const ov = await overlay(page);
  rec.ev(await L.shot(page, 'TS-24-dialog'));
  rec.cp('2 步数变为 0 且未达标时出现“本关失败”，覆盖棋盘，显示第 5 关与本关得分 X，步数 0 且从不为负',
    d.name === '本关失败' && norm(d.text).includes('第5关') && norm(d.text).includes(`本关得分${h.score}`) && h.moves === 0 && h.score < h.target && neg.length === 0 && ov.ok,
    `dialog“${d.name}”：${d.text}；信息栏 ${fmtHud(h)}；${ov.o}${neg.length ? '；出现非法步数 ' + neg.join(',') : ''}`);
  const t = await tryWhileDialog(page);
  rec.cp('3 失败画面显示期间交换不生效', t.same, t.o);
  await pressDialogButton(page, '重玩本关');
  const h2 = await L.hud(page);
  const s = await L.play(page, { how: 'gesture' });
  rec.cp('4 轻点“重玩本关”后仍为第 5 关，目标不变，得分 0，步数恢复为限定步数，之后交换正常生效',
    h2.level === 5 && h2.target === start.target && h2.score === 0 && h2.moves === start.moves && !s.none && s.h1.moves === s.h0.moves - 1,
    `点击后 ${fmtHud(h2)}（进入本关时 ${fmtHud(start)}）；再交换：${s.none ? '无可交换位置' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
  page = await L.reopen(page);
  const h3 = await L.hud(page);
  rec.ev(await L.shot(page, 'TS-24-reopen'));
  rec.cp('5 关闭并重新打开后仍为第 5 关', h3.level === 5, fmtHud(h3));
});

const T25 = async (rec) => {
  const lv = [1, 2, 3, 4, 5, 6, 7, 8, 19, 20, 21, 50];
  const p = {};
  for (const n of lv) p[n] = await levelParams(n);
  const pairs = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [19, 20], [20, 21], [21, 50]];
  const tab = lv.map((n) => `第${n}关 目标${p[n].target}/步数${p[n].moves}${p[n].level === n ? '' : `（显示为第${p[n].level}关）`}`).join('；');
  const lvlOk = lv.every((n) => p[n].level === n);
  rec.cp('1 相邻读取的关卡中后一关目标分数严格更高', lvlOk && pairs.every(([a, b]) => p[b].target > p[a].target), tab);
  rec.cp('2 后一关限定步数不多于前一关', lvlOk && pairs.every(([a, b]) => p[b].moves <= p[a].moves), pairs.map(([a, b]) => `${a}→${b}: ${p[a].moves}→${p[b].moves}`).join('，'));
  rec.cp('3 第 5 关限定步数少于第 1 关', p[5].moves < p[1].moves, `第 1 关 ${p[1].moves} 步，第 5 关 ${p[5].moves} 步`);
  await withPage(rec, { storage: { 'swap-match.level': 50 }, tag: 'level50' }, async (page) => {
    const B = await L.readBoard(page);
    const o = [];
    let ok = L.full(B);
    for (let i = 0; i < 2; i++) {
      const s = await L.play(page, { how: 'gesture' });
      ok = ok && !s.none && s.h1.moves === s.h0.moves - 1 && s.h1.level === 50;
      o.push(s.none ? '无可交换位置' : `${fmtHud(s.h0)} → ${fmtHud(s.h1)}`);
    }
    rec.ev(await L.shot(page, 'TS-25-level50'));
    rec.cp('4 第 50 关正常显示并可进行有效交换', ok, `方块 ${B.count}；${o.join('；')}`);
  });
};

const T33 = async (rec) => {
  await withPage(rec, { storage: { 'swap-match.highScore': 20 }, tag: 'A' }, async (page) => {
    let h = await L.hud(page);
    const seq = [`开始 得分${h.score} 最高${h.high}`];
    let ok = h.score <= 20 ? h.high === 20 : true;
    let prevHigh = h.high;
    let crossed = false;
    for (let i = 0; i < 10 && !crossed; i++) {
      const s = await L.play(page, { pick: L.weak, how: 'gesture' });
      if (s.none) { await L.sleep(500); continue; }
      h = s.h1;
      const exp = h.score <= 20 ? 20 : Math.max(prevHigh, h.score);
      if (h.high !== exp) ok = false;
      seq.push(`得分${h.score} 最高${h.high}（应 ${exp}）`);
      prevHigh = h.high;
      if (h.score > 20) crossed = true;
      if (s.dlg) break;
    }
    rec.cp('1 本关进行中得分第一次超过 20 时历史最高分即等于本关得分', ok && crossed && !(await L.dialogState(page)), seq.join('；'));
    const before = (await L.hud(page)).high;
    page = await L.reopen(page);
    const after = (await L.hud(page)).high;
    rec.cp('2 关卡进行中关闭再打开，历史最高分等于关闭前显示的值', after === before, `关闭前 ${before}，重开后 ${after}`);
    const r = await L.playToEnd(page, { pick: L.strong, how: 'gesture' }, 40);
    rec.log.push(...r.trace);
    if (r.end !== '过关') { rec.log.push(`40 次有效交换内未过关（${r.end || '无提示画面'}），检查点 3 不下结论`); return; }
    const P1 = (await L.hud(page)).score;
    await pressDialogButton(page, '下一关');
    let P2 = 0;
    for (let i = 0; i < 3; i++) {
      const s = await L.play(page, { pick: L.weak, how: 'gesture' });
      if (s.none) continue;
      P2 = s.h1.score;
      if (P2 > 0 && P2 < P1) break;
    }
    const hh = await L.hud(page);
    rec.ev(await L.shot(page, 'TS-33-A'));
    rec.cp('3 历史最高分 = 单关最高本关得分 P1（不是累计）', hh.high === P1, `过关时 P1=${P1}；下一关得分 P2=${P2}；历史最高分 ${hh.high}`);
  });
  await withPage(rec, { storage: { 'swap-match.highScore': 999999 }, tag: 'B' }, async (page) => {
    const o = [];
    for (let i = 0; i < 5; i++) { const s = await L.play(page, { how: 'gesture' }); if (!s.none) o.push(`得分${s.h1.score}`); }
    const h = await L.hud(page);
    rec.cp('4 预置 999999 时做 5 次有效交换后历史最高分保持 999999', h.high === 999999, `${o.join('，')}；历史最高分 ${h.high}`);
  });
};

export default [
  { id: 'TS-21', title: '达到目标分数即过关，进入下一关', fn: T21 },
  { id: 'TS-22', title: '本机记住已到达的最高关卡', fn: T22 },
  { id: 'TS-24', title: '步数用完未达标即失败，重玩本关', fn: T24 },
  { id: 'TS-25', title: '难度随关卡递增，关卡不设上限', fn: T25 },
  { id: 'TS-33', title: '历史最高分即时更新、重开仍在、记单关最高', fn: T33 },
];
