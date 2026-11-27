// Long sessions (test plan §1.5): game A (sound on, mouse) and game B (muted).
import {
  desktopContext, openGame, readBoard, hud, removable, singles, dims, key, emptiedColumns, audioCounts, endSoundCounts,
  dialog, board, muteBtn, stat, sleep, now, shot, writeEvidence, bySize, colorsOf, serialize, clickCell, settle,
} from './lib.mjs';
import { removeGroup, describeDiff, fullBoardCheck, waitDialog, anyDialog } from './play.mjs';
import { Rec, finish } from './report.mjs';

const GAME_CAP_MS = 20 * 60 * 1000;
const LEVEL_CAP_MS = 6 * 60 * 1000;

// Is the dialog drawn over the board centre?
export async function overlayCheck(page, name) {
  return page.evaluate(([dn]) => {
    const b = document.querySelector('[role="group"][aria-label="棋盘"]').getBoundingClientRect();
    const d = [...document.querySelectorAll('[role="dialog"]')].find((e) => e.getAttribute('aria-label') === dn || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim() === dn));
    if (!d) return { ok: false, why: 'dialog element not found' };
    const r = d.getBoundingClientRect();
    const overlap = r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const inDialog = !!hit && (d === hit || d.contains(hit));
    const boardHit = !!hit && !!hit.closest('[role="group"][aria-label="棋盘"]');
    const backdrop = !!hit && hit.contains(d) && !boardHit;
    return { ok: overlap && !boardHit && (inDialog || backdrop), overlap, inDialog, backdrop, boardHit, hit: hit && (hit.tagName + '.' + hit.className) };
  }, [name]).catch((e) => ({ ok: false, why: String(e) }));
}

// Click the board centre region while a dialog is shown; returns whether board/score stayed the same.
async function clickBoardUnderDialog(page) {
  const s0 = serialize(await readBoard(page)); const h0 = await hud(page);
  const box = await board(page).boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.8], [0.8, 0.9]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await sleep(1200);
  const s1 = serialize(await readBoard(page)); const h1 = await hud(page);
  return { same: s0 === s1 && h0.score === h1.score, obs: `点击前后棋盘${s0 === s1 ? '相同' : '不同'}，分数 ${h0.score}→${h1.score}` };
}

async function dialogText(page, name) { return ((await dialog(page, name).textContent()) || '').replace(/\s+/g, ' ').trim(); }

// ================= Game A =================
export async function gameA() {
  const R = {};
  for (const [id, t] of [['TS-01', '鼠标玩到本关结束'], ['TS-03', 'f'], ['TS-08', '下落'], ['TS-09', '列靠拢'], ['TS-10', '计分'], ['TS-12', '三项信息'], ['TS-13', '不结束'], ['TS-14', '过关'], ['TS-15', '游戏结束'], ['TS-17', '重新开始'], ['TS-18', '难度递增'], ['TS-23', '最高分保留'], ['TS-28', '靠拢动画'], ['TS-29', '过关画面'], ['TS-30', '游戏结束画面'], ['TS-31', '音效']]) R[id] = new Rec(id, t);
  const log = [];
  const st = { trace: [] };
  const ctx = await desktopContext();
  let page;
  const t0 = now();
  const scores = new Map(); // n -> Set(gain)
  const levelInfo = []; // {level, target, colors}
  const endJudgements = [];
  let removals = 0, mismatches = [], noDialogChecks = 0, overTargetChecked = 0;
  let colSeen = { mid: false, left: false, right: false, two: false };
  let levelStartT = now();
  let firstLevelEnd = null, firstClear = null, gameOver = null, restarted = false;
  let T1 = null;
  let scoreMonotonic = true, scoreUpdateOk = true, hudDuringAnimChecked = false;
  let audioMissing = [], clearSoundChecked = false;
  const evShots = [];
  try {
    page = await openGame(ctx, log);
    await sleep(800);
    // TS-12 cp1, TS-01 cp1
    let h = await hud(page);
    T1 = h.target;
    R['TS-12'].cp('1 打开页面：当前分数 0、当前关卡 1、显示本关目标分数', h.score === 0 && h.level === 1 && Number.isInteger(h.target) && h.target > 0, JSON.stringify(h));
    const loginish = await page.getByRole('textbox').count() + await page.getByRole('button', { name: /登录|注册/ }).count();
    let snap = await readBoard(page);
    R['TS-01'].cp('1 打开页面直接看到棋盘与三项信息，没有登录或注册', snap.cells.size > 0 && Number.isInteger(h.score) && Number.isInteger(h.target) && Number.isInteger(h.level) && loginish === 0, `方块数 ${snap.cells.size}，HUD ${JSON.stringify(h)}，登录/注册控件 ${loginish}`);
    // level-start board check for TS-03 f and TS-18
    const recordLevelStart = async (s) => {
      const hh = await hud(page);
      const fb = fullBoardCheck(s);
      levelInfo.push({ level: hh.level, target: hh.target, colors: fb.colors, full: fb.ok, count: fb.count });
      st.R = fb.R;
    };
    await recordLevelStart(snap);
    // TS-12 cp5: click a single tile -> nothing changes (also the first pointer interaction for audio, G2 I14)
    const sg = singles(snap);
    if (sg.length) {
      const [r, c] = sg[0].cells[0];
      const s0 = serialize(snap), h0 = await hud(page);
      await clickCell(page, snap, r, c);
      await sleep(600);
      const s1 = serialize(await readBoard(page)), h1 = await hud(page);
      R['TS-12'].cp('5 对照：单击单个方块后三项信息都不变', s0 === s1 && h0.score === h1.score && h0.target === h1.target && h0.level === h1.level, `单个方块 ${r},${c}；HUD 前 ${JSON.stringify(h0)} 后 ${JSON.stringify(h1)}`);
    } else {
      await muteBtn(page).hover(); // no single tile: first interaction happens on the first removal
    }

    const wantSizes = [2, 3, 4, 6, 8, 5, 7, 9, 10, 12];
    const chooseGroup = (s, gs) => {
      if (!colSeen.mid || !colSeen.left || !colSeen.two || !colSeen.right) {
        for (const g of gs) {
          const e = emptiedColumns(s, g.cells);
          if (!e.emptied.length) continue;
          const minC = Math.min(...[...s.cells.values()].map((t) => t.c));
          const two = e.emptied.some((c) => e.emptied.includes(c + 1));
          if ((!colSeen.mid && e.hasRight) || (!colSeen.left && e.emptied.includes(minC) && e.hasRight) || (!colSeen.two && two) || (!colSeen.right && e.emptied.includes(e.maxC) && !e.hasRight)) return g;
        }
      }
      for (const n of wantSizes) if (!scores.has(n)) { const g = gs.find((x) => x.size === n); if (g) return g; }
      return bySize(gs)[0];
    };

    while (true) {
      if (now() - t0 > GAME_CAP_MS) { log.push('game A cap reached'); break; }
      snap = await readBoard(page);
      const gs = removable(snap);
      h = await hud(page);
      if (!gs.length) {
        // level should end
        const d = await waitDialog(page, 8000);
        const endScore = (await hud(page)).score;
        const expectClear = endScore >= h.target;
        endJudgements.push({ level: h.level, score: endScore, target: h.target, cleared: d.cleared, over: d.over, tiles: snap.cells.size });
        if (!firstLevelEnd) {
          firstLevelEnd = d;
          R['TS-01'].cp('3 没有可消除组后出现“过关”或“游戏结束”提示画面之一', d.cleared !== d.over, `第 ${h.level} 关结束，分数 ${endScore}，目标 ${h.target}，过关画面 ${d.cleared}，游戏结束画面 ${d.over}`);
        }
        if (snap.cells.size === 0) R['TS-14'].cp('4 棋盘被全部消除空时本关结束并按分数判定', (expectClear ? d.cleared : d.over), `棋盘空，分数 ${endScore}，目标 ${h.target}，过关 ${d.cleared}，游戏结束 ${d.over}`);
        if (!d.cleared && !d.over) { R['TS-15'].cp('3 本关结束时出现提示画面', false, `没有可消除组后 8 秒内没有出现提示画面（第 ${h.level} 关，分数 ${endScore}）`); evShots.push(await shot(page, 'gameA-no-dialog')); break; }
        if (d.cleared) {
          if (!firstClear) {
            firstClear = true;
            // TS-31 cp3
            await sleep(600);
            const a = await endSoundCounts(page);
            R['TS-31'].cp('3 出现“过关”提示画面时音源开始次数增加', !!a && a.total > a.before, a ? `过关画面出现前（含最后一次消除）${a.before}，过关画面出现后 ${a.total}` : '没有记录到过关画面出现的时间');
            clearSoundChecked = true;
            // TS-14 cp1, TS-29
            R['TS-14'].cp('1 出现“过关”提示画面，没有“游戏结束”提示画面', d.cleared && !d.over, `分数 ${endScore} ≥ 目标 ${h.target}`);
            const txt = await dialogText(page, '过关');
            const ov = await overlayCheck(page, '过关');
            R['TS-29'].cp('1 名称与文字写明“过关”的提示画面覆盖在棋盘之上', txt.includes('过关') && ov.ok, `文字：${txt}；覆盖检查 ${JSON.stringify(ov)}`);
            R['TS-29'].cp('5 提示画面中显示当前分数', txt.includes(String(endScore)), `文字：${txt}；当前分数 ${endScore}`);
            const hv = await hud(page);
            const vis = (await stat(page, '当前分数').isVisible()) && (await stat(page, '本关目标分数').isVisible()) && (await stat(page, '当前关卡').isVisible());
            R['TS-29'].ev(await shot(page, 'TS-29-level-cleared'));
            const cb = await clickBoardUnderDialog(page);
            R['TS-29'].cp('2 提示画面显示期间点击棋盘区域不改变棋盘与分数', cb.same, cb.obs);
            await sleep(3000);
            R['TS-29'].cp('4 执行“下一关”之前提示画面不自动消失（等待 3 秒以上）', await dialog(page, '过关').isVisible(), '点击棋盘后再等 3 秒，过关画面仍显示');
            const btn = dialog(page, '过关').getByRole('button', { name: '下一关', exact: true });
            await btn.click();
            await sleep(400);
            await settle(page, 300);
            const gone = !(await dialog(page, '过关').isVisible());
            const s2 = await readBoard(page);
            const h2 = await hud(page);
            const fb = fullBoardCheck(s2);
            R['TS-29'].cp('3 提示画面中有进入下一关的操作；执行后提示画面消失，显示新棋盘', gone && fb.ok, `下一关后画面消失 ${gone}，新棋盘 ${JSON.stringify(fb)}`);
            R['TS-14'].cp('2 点“下一关”后提示画面消失、关卡+1、分数不变、目标更新、新满格棋盘', gone && h2.level === h.level + 1 && h2.score === endScore && h2.target !== h.target && fb.ok, `前 ${JSON.stringify(hv)} 后 ${JSON.stringify(h2)} 棋盘 ${JSON.stringify(fb)}`);
            R['TS-12'].cp('3 过关提示画面显示时三项信息仍可见', vis, `可见 ${vis}`);
            R['TS-12'].cp('4 进入下一关后关卡+1、目标为新值、分数不清零', h2.level === h.level + 1 && h2.score === endScore && h2.target !== h.target, `前 ${JSON.stringify(hv)} 后 ${JSON.stringify(h2)}`);
            st.checkNextMove = 'TS-14';
            await recordLevelStart(s2);
            levelStartT = now();
            continue;
          }
          await dialog(page, '过关').getByRole('button', { name: '下一关', exact: true }).click();
          await sleep(400); await settle(page, 300);
          await recordLevelStart(await readBoard(page));
          levelStartT = now();
          continue;
        }
        // game over
        if (!gameOver) {
          gameOver = true;
          await sleep(600);
          const a = await endSoundCounts(page);
          R['TS-31'].cp('4 出现“游戏结束”提示画面时音源开始次数增加', !!a && a.total > a.before, a ? `游戏结束画面出现前（含最后一次消除）${a.before}，游戏结束画面出现后 ${a.total}` : '没有记录到游戏结束画面出现的时间');
          R['TS-15'].cp('1 本关结束时分数 < 目标，出现“游戏结束”提示画面，没有“过关”画面', endScore < h.target && d.over && !d.cleared, `第 ${h.level} 关，分数 ${endScore}，目标 ${h.target}`);
          const txt = await dialogText(page, '游戏结束');
          const ov = await overlayCheck(page, '游戏结束');
          R['TS-30'].ev(await shot(page, 'TS-30-game-over'));
          R['TS-30'].cp('1 名称与文字写明“游戏结束”的提示画面覆盖在棋盘之上，没有“过关”字样', txt.includes('游戏结束') && !txt.includes('过关') && ov.ok, `文字：${txt}；覆盖检查 ${JSON.stringify(ov)}`);
          const rb = dialog(page, '游戏结束').getByRole('button', { name: '重新开始', exact: true });
          R['TS-30'].cp('2 提示画面中有“重新开始”操作', await rb.isVisible(), '查找名为“重新开始”的按钮');
          R['TS-30'].cp('3 提示画面中显示当前分数', txt.includes(String(endScore)), `文字：${txt}；当前分数 ${endScore}`);
          const hv = await hud(page);
          R['TS-23'].cp('1 游戏结束提示画面出现时历史最高分 = 游戏结束时的分数 F', hv.high === endScore, `F=${endScore}，历史最高分 ${hv.high}`);
          const cb = await clickBoardUnderDialog(page);
          R['TS-15'].cp('2 游戏结束提示画面显示期间点击棋盘不改变棋盘与分数', cb.same, cb.obs);
          const vis = (await stat(page, '当前分数').isVisible()) && (await stat(page, '本关目标分数').isVisible()) && (await stat(page, '当前关卡').isVisible());
          R['TS-12'].cp('3 游戏结束提示画面显示时三项信息仍可见', vis, `可见 ${vis}`);
          const bad = endJudgements.filter((j) => (j.score >= j.target) !== j.cleared || (j.score < j.target) !== j.over);
          R['TS-15'].cp('3 每次本关结束的判定都与“分数 ≥ 目标则过关，否则游戏结束”一致', bad.length === 0, JSON.stringify(endJudgements));
          // TS-17 restart
          const H = hv.high;
          await rb.click();
          await sleep(400); await settle(page, 300);
          const gone = !(await dialog(page, '游戏结束').isVisible());
          const h2 = await hud(page);
          const s2 = await readBoard(page);
          const fb = fullBoardCheck(s2);
          R['TS-17'].cp('1 提示画面消失；关卡 1；分数 0；目标 = 第 1 关目标 T1', gone && h2.level === 1 && h2.score === 0 && h2.target === T1, `T1=${T1}，重新开始后 ${JSON.stringify(h2)}，画面消失 ${gone}`);
          R['TS-17'].cp('2 新棋盘每格都有方块、至少 2 种颜色', fb.ok, JSON.stringify(fb));
          R['TS-17'].cp('3 历史最高分仍为 H', h2.high === H, `H=${H}，重新开始后 ${h2.high}`);
          R['TS-23'].cp('2 点“重新开始”后历史最高分仍为 F', h2.high === endScore, `F=${endScore}，${h2.high}`);
          st.R = fb.R;
          const g = bySize(removable(s2))[0];
          if (g) {
            const info = await removeGroup(page, st, g.cells, { before: s2 });
            R['TS-17'].cp('4 新的一局可以正常游玩：分数从 0 增加为这次得分', info.match && info.h0.score === 0 && info.h1.score === info.gain && info.gain > 0, `消除 ${info.n} 个，分数 ${info.h0.score}→${info.h1.score}，棋盘符合预测 ${info.match}`);
          }
          restarted = true;
          // TS-23 cp3 reopen
          const F = endScore;
          await page.close();
          page = await openGame(ctx, log);
          const h3 = await hud(page);
          R['TS-23'].cp('3 关闭并重新打开页面后历史最高分仍为 F', h3.high === F, `F=${F}，重开后 ${h3.high}`);
          // continue only if level 3 was not reached yet
          if (Math.max(...levelInfo.map((l) => l.level)) >= 3) break;
          await recordLevelStart(await readBoard(page));
          continue;
        }
        break;
      }
      // a removal
      const g = chooseGroup(snap, gs);
      const e = emptiedColumns(snap, g.cells);
      const minC = Math.min(...[...snap.cells.values()].map((t) => t.c));
      const midEmpty = e.hasRight;
      const sample = midEmpty && !R['TS-28'].cps.length;
      if (sample) await sleep(300);
      const info = await removeGroup(page, st, g.cells, { before: snap, sample });
      st.lastAudio = info.a1.start;
      removals++;
      if (!info.match) mismatches.push(`第 ${removals} 次（第 ${info.h0.level} 关，点击 ${g.cells[0]}）：${describeDiff(info.pred.snap, info.after)}`);
      if (removals <= 30 || !info.match) {
        if (info.a1.start <= info.a0.start) audioMissing.push(`第 ${removals} 次消除：开始次数 ${info.a0.start}→${info.a1.start}`);
      }
      if (info.gain <= 0 || info.h1.score !== info.h0.score + info.gain) scoreUpdateOk = false;
      if (info.h1.score < info.h0.score) scoreMonotonic = false;
      if (info.n > 0) { if (!scores.has(info.n)) scores.set(info.n, new Set()); scores.get(info.n).add(info.gain); }
      if (removals === 1) {
        R['TS-01'].cp('2 单击可消除组，该组被消除，当前分数增加', info.match && info.gain > 0, `第一次消除 ${info.n} 个，分数 ${info.h0.score}→${info.h1.score}，符合预测 ${info.match}`);
      }
      if (st.checkNextMove === 'TS-14') {
        R['TS-14'].cp('3 新一关可以正常消除，分数增加', info.match && info.gain > 0, `消除 ${info.n} 个，分数 ${info.h0.score}→${info.h1.score}`);
        st.checkNextMove = null;
      }
      // column emptying checks (TS-09) and its animation (TS-28)
      if (e.emptied.length) {
        const two = e.emptied.some((c) => e.emptied.includes(c + 1));
        const obs = `消除使第 ${e.emptied.join('、')} 列变空（原最右非空列 ${e.maxC}）；棋盘符合预测 ${info.match}${info.match ? '' : '：' + describeDiff(info.pred.snap, info.after)}`;
        if (e.hasRight && !colSeen.mid) { colSeen.mid = true; R['TS-09'].cp('1 中间某列变空：右侧各列整体左移，棋盘等于预测棋盘', info.match, obs); }
        if (e.emptied.includes(minC) && e.hasRight && !colSeen.left) { colSeen.left = true; R['TS-09'].cp('2 最左列变空：棋盘等于预测棋盘', info.match, obs); }
        if (e.emptied.includes(e.maxC) && !e.hasRight && !colSeen.right) { colSeen.right = true; R['TS-09'].cp('3 最右的非空列变空：其余列位置不变，棋盘等于预测棋盘', info.match, obs); }
        if (two && e.hasRight && !colSeen.two) { colSeen.two = true; R['TS-09'].cp('4 相邻两列同时变空：右侧各列左移两列，棋盘等于预测棋盘', info.match, obs); }
      }
      if (sample && info.sample) {
        R['TS-28'].cp('1 向左靠拢的列中至少一个方块有一次取样位于原位置与新位置之间', info.sample.shiftMid, `取样 ${info.sample.frames} 帧，左移方块 ${info.sample.shifters} 个，观察到中间位置 ${info.sample.shiftMid}`);
      }
      if (!hudDuringAnimChecked && info.busyStarted) hudDuringAnimChecked = true;
      // TS-13
      const hasMoves = removable(info.after).length > 0;
      if (hasMoves) {
        const longWindow = noDialogChecks < 6 || (info.h1.score >= info.h1.target && overTargetChecked < 3);
        if (longWindow) {
          await sleep(2000);
          const d = await anyDialog(page);
          noDialogChecks++;
          if (d.cleared || d.over) R['TS-13'].cp('1 还有可消除组时观察窗口内不出现提示画面', false, `第 ${removals} 次消除后仍有可消除组，但出现了提示画面 ${JSON.stringify(d)}`);
          if (info.h1.score >= info.h1.target && overTargetChecked < 3) {
            overTargetChecked++;
            if (!st.overTargetPending) st.overTargetPending = { score: info.h1.score, target: info.h1.target, ok: !(d.cleared || d.over), at: removals };
          }
        } else if ((await anyDialog(page)).cleared || (await anyDialog(page)).over) {
          R['TS-13'].cp('1 还有可消除组时不出现提示画面', false, `第 ${removals} 次消除后仍有可消除组，但出现了提示画面`);
        }
      }
      if (st.overTargetPending && st.overTargetPending.done !== true && removals > st.overTargetPending.at && info.h0.level === info.h1.level) {
        const p = st.overTargetPending;
        R['TS-13'].cp('2 分数已 ≥ 目标但仍有可消除组时本关不结束，继续消除仍能加分', p.ok && info.match && info.gain > 0, `分数 ${p.score} ≥ 目标 ${p.target} 时未出现提示画面 ${p.ok}；之后再消除 ${info.n} 个，分数 ${info.h0.score}→${info.h1.score}`);
        p.done = true;
      }
      if (!firstLevelEnd && now() - levelStartT > LEVEL_CAP_MS) { log.push('first level 6min cap'); }
    }
  } catch (e) {
    log.push(`[game A error] ${e.stack || e}`);
    if (page) evShots.push(await shot(page, 'gameA-error'));
    for (const id of Object.keys(R)) if (!R[id].cps.length) R[id].drop(`game A aborted before reaching this scenario: ${e.message}`);
    // a script exception mid-game is reported on the scenarios that already have checkpoints
    for (const r of Object.values(R)) if (r.cps.length) r.cp('脚本执行', false, `长局执行中出错：${String(e.message).split('\n')[0]}`);
  }
  // ---- summarise data-driven scenarios ----
  const trace = writeEvidence('gameA-trace.log', st.trace.join('\n'));
  const L = writeEvidence('gameA-client.log', log.join('\n'));
  for (const r of Object.values(R)) { r.ev(trace); r.ev(L); evShots.forEach((s) => r.ev(s)); }

  if (!firstLevelEnd) R['TS-01'].drop('6 分钟内没有出现提示画面');
  // TS-03 f
  const badLv = levelInfo.filter((l) => !l.full || l.colors < 2);
  R['TS-03'].cp('f 每关开始时棋盘每格都有方块、至少 2 种颜色', levelInfo.length > 0 && badLv.length === 0, JSON.stringify(levelInfo));
  R['TS-03'].fOnly = true;
  // TS-08
  R['TS-08'].cp('1-2 每次消除后棋盘等于预测棋盘（下落、列内无空位、无新方块）', mismatches.length === 0 && removals >= 10, `共检查 ${removals} 次消除，不符合 ${mismatches.length} 次 ${mismatches.slice(0, 5).join('；')}`);
  // TS-09
  if (!colSeen.mid) R['TS-09'].drop('没有观察到中间列变空');
  if (!R['TS-28'].cps.length) R['TS-28'].drop('没有出现整列变空且右侧有列的消除');
  // TS-10
  const obs = [...scores.entries()].sort((a, b) => a[0] - b[0]);
  if (!scores.has(2) || !scores.has(4)) R['TS-10'].drop(`没有凑齐 n=2 与 n=4：${JSON.stringify(obs.map(([n, s]) => [n, [...s]]))}`);
  else {
    const S = new Map(obs.map(([n, s]) => [n, [...s][0]]));
    const txt = JSON.stringify(obs.map(([n, s]) => [n, [...s]]));
    R['TS-10'].cp('1 每次得分 > 0', obs.every(([, s]) => [...s].every((g) => g > 0)), txt);
    R['TS-10'].cp('2 同一 n 的每次得分都相同', obs.every(([, s]) => s.size === 1), txt);
    const ns = [...S.keys()];
    let mono = true;
    for (let i = 1; i < ns.length; i++) if (!(S.get(ns[i - 1]) < S.get(ns[i]))) mono = false;
    R['TS-10'].cp('3 n1 < n2 时 S(n1) < S(n2)', mono, txt);
    const pairs = ns.filter((n) => S.has(2 * n)).map((n) => [n, S.get(n), S.get(2 * n), S.get(2 * n) >= 2 * (2 * S.get(n))]);
    R['TS-10'].cp('4 观察到的每一对 N 与 2N：S(2N) ≥ 2×(S(N)+S(N))', pairs.length > 0 && pairs.every((p) => p[3]), `[N,S(N),S(2N),ok]：${JSON.stringify(pairs)}`);
    // all partitions into observed parts (each ≥2, at least 2 parts)
    const bad = [];
    let checked = 0;
    const parts = (n, max, acc) => {
      if (n === 0) { if (acc.length >= 2) { checked++; const sum = acc.reduce((a, p) => a + S.get(p), 0); if (!(S.get(acc.reduce((a, b) => a + b, 0)) > sum)) bad.push(acc.join('+')); } return; }
      for (const p of ns) if (p <= max && p <= n && p >= 2) parts(n - p, p, [...acc, p]);
    };
    for (const n of ns) parts(n, n, []);
    if (checked) R['TS-10'].cp('5 观察到的 n 的任意拆法：S(n) > 各组得分之和', bad.length === 0, `检查 ${checked} 种拆法，不满足：${bad.slice(0, 10).join('、') || '无'}`);
  }
  // TS-12 cp2/3
  R['TS-12'].cp('2 每次消除后当前分数 = 消除前 + 这次得分且增加，一局内从不减少', removals > 0 && scoreUpdateOk && scoreMonotonic, `消除 ${removals} 次，更新正确 ${scoreUpdateOk}，单调 ${scoreMonotonic}`);
  if (!firstClear && !gameOver) R['TS-12'].drop('6 分钟内没有玩到本关结束');
  // TS-13
  if (!R['TS-13'].cps.some((c) => c.step.startsWith('1'))) R['TS-13'].cp('1 还有可消除组时观察窗口内不出现提示画面', noDialogChecks > 0, `做了 ${noDialogChecks} 次 2 秒观察，均未出现提示画面；其余各次消除后也未见提示画面`);
  if (!firstClear) { R['TS-14'].drop('没有观察到过关'); R['TS-29'].drop('没有观察到过关'); }
  if (!gameOver) for (const id of ['TS-15', 'TS-17', 'TS-23', 'TS-30']) R[id].drop('20 分钟内没有出现游戏结束');
  // TS-18
  const lv = [];
  for (const l of levelInfo) if (!lv.some((x) => x.level === l.level)) lv.push(l);
  lv.sort((a, b) => a.level - b.level);
  if (!lv.some((l) => l.level >= 3)) R['TS-18'].drop('没有进入第 3 关');
  else {
    const rows = [];
    for (let i = 0; i + 1 < lv.length; i++) {
      const a = lv[i], b = lv[i + 1];
      if (b.level !== a.level + 1) continue;
      const needA = a.target - (i === 0 && a.level === 1 ? 0 : (lv.find((x) => x.level === a.level - 1)?.target ?? NaN));
      const needB = b.target - a.target;
      rows.push({ L: a.level, colors: [a.colors, b.colors], target: [a.target, b.target], need: [needA, needB] });
    }
    const t = JSON.stringify(rows);
    R['TS-18'].cp('1 颜色种类数(L+1) ≥ 颜色种类数(L)', rows.length >= 2 && rows.every((r) => r.colors[1] >= r.colors[0]), t);
    R['TS-18'].cp('2 目标分数(L+1) > 目标分数(L)', rows.length >= 2 && rows.every((r) => r.target[1] > r.target[0]), t);
    R['TS-18'].cp('3 本关需新得分数(L+1) ≥ 本关需新得分数(L)（第 1 关上一关目标按 0）', rows.length >= 2 && rows.filter((r) => Number.isFinite(r.need[0])).every((r) => r.need[1] >= r.need[0]), t);
  }
  // TS-31 cp1
  R['TS-31'].cp('1 每次成功消除后音源开始次数增加', removals > 0 && audioMissing.length === 0, `检查前 30 次消除，未增加的：${audioMissing.slice(0, 5).join('；') || '无'}`);
  if (!clearSoundChecked) R['TS-31'].log.push('过关检查点未观察到（不报告该检查点）');
  if (ctx) await ctx.close().catch(() => {});
  return R;
}

// ================= Game B (muted) =================
export async function gameB() {
  const rec = new Rec('TS-33', '静音跨过关、游戏结束与重新开始保持');
  const log = []; const st = { trace: [] };
  const ctx = await desktopContext();
  const t0 = now();
  let page;
  try {
    page = await openGame(ctx, log);
    let snap = await readBoard(page);
    st.R = dims(snap).R;
    // first interaction on the board, then mute
    const sg = singles(snap);
    if (sg.length) { const [r, c] = sg[0].cells[0]; await clickCell(page, snap, r, c); await sleep(300); }
    else { const box = await board(page).boundingBox(); await page.mouse.move(box.x + 2, box.y + 2); await page.mouse.down(); await page.mouse.move(box.x - 20, box.y - 20); await page.mouse.up(); }
    await muteBtn(page).click();
    const pressed0 = await muteBtn(page).getAttribute('aria-pressed');
    const base = await audioCounts(page);
    let cleared = 0, over = false, nextLevelPressed = [], afterRestart = null;
    while (now() - t0 < GAME_CAP_MS) {
      snap = await readBoard(page);
      const gs = removable(snap);
      if (!gs.length) {
        const d = await waitDialog(page, 8000);
        if (d.cleared) {
          await dialog(page, '过关').getByRole('button', { name: '下一关', exact: true }).click();
          await sleep(400); await settle(page, 300);
          cleared++;
          nextLevelPressed.push(await muteBtn(page).getAttribute('aria-pressed'));
          st.R = dims(await readBoard(page)).R;
          continue;
        }
        if (d.over) {
          over = true;
          await sleep(800);
          await dialog(page, '游戏结束').getByRole('button', { name: '重新开始', exact: true }).click();
          await sleep(400); await settle(page, 300);
          afterRestart = await muteBtn(page).getAttribute('aria-pressed');
          const s2 = await readBoard(page); st.R = dims(s2).R;
          const g = bySize(removable(s2))[0];
          if (g) await removeGroup(page, st, g.cells, { before: s2 });
          await sleep(800);
        }
        break;
      }
      await removeGroup(page, st, bySize(gs)[0].cells, { before: snap });
    }
    if (!over) rec.drop('20 分钟内没有出现游戏结束');
    else {
      const a = await audioCounts(page);
      rec.cp('1 整个过程中音源开始次数不增加，没有媒体元素播放', a.start === base.start && a.media === 0, `静音后基准 ${JSON.stringify(base)}，结束时 ${JSON.stringify(a)}；经过过关 ${cleared} 次、游戏结束与重新开始`);
      rec.cp('2 进入下一关后、重新开始后静音按钮仍为已静音', pressed0 === 'true' && nextLevelPressed.every((p) => p === 'true') && afterRestart === 'true', `静音后 ${pressed0}；各次进入下一关后 ${JSON.stringify(nextLevelPressed)}；重新开始后 ${afterRestart}`);
    }
  } catch (e) {
    log.push(String(e.stack || e));
    rec.cp('脚本执行', false, `执行中出错：${String(e.message).split('\n')[0]}`);
    if (page) rec.ev(await shot(page, 'TS-33-error'));
  }
  rec.ev(writeEvidence('TS-33-trace.log', st.trace.join('\n')));
  rec.log.push(...log);
  await ctx.close().catch(() => {});
  finish(rec);
}
