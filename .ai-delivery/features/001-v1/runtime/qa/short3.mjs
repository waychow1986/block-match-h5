// Short scenarios for AC-11/12/14/15: TS-25, TS-26, TS-27, TS-32, TS-34, TS-35.
import {
  readBoard, hud, removable, singles, key, serialize, board, muteBtn, sleep, clickCell, waitIdle, predict,
  highlightedNames, tileStyle, layoutCheck, visibleAll, audioCounts, bySize, shot, emptiedColumns, openGame,
} from './lib.mjs';
import { removeGroup } from './play.mjs';
import { scenario, okRemoval, remObs, state, unchangedSince, center, emptyCell, touch, outsideBoard, hasTileAbove } from './short.mjs';

const names = (snap, cells) => cells.map(([r, c]) => snap.cells.get(key(r, c)).name).sort();
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

// ---------- TS-25 ----------
export async function ts25() {
  await scenario('TS-25', '电脑上悬停与按下时突出显示整组', async (rec, open) => {
    const e = await open();
    const { page } = e;
    let s = await readBoard(page);
    const gs = bySize(removable(s)).reverse();
    const A = gs[0], B = gs[1];
    const C = singles(s)[0];
    const nA = names(s, A.cells), nB = names(s, B.cells);
    await page.mouse.move(2, 2); await sleep(400);
    const baseA = await tileStyle(page, nA[0]);
    const pa = center(s, A.cells[0]), pb = center(s, B.cells[0]);
    await page.mouse.move(pa.x, pa.y); await sleep(400);
    let hl = await highlightedNames(page);
    const styA = await tileStyle(page, nA[0]);
    rec.cp('1 指针停在组 A 上：组 A 全部突出显示、其他不突出，样式可见不同', sameSet(hl, nA) && styA !== baseA, `组 A ${nA.length} 个，突出显示 ${hl.length} 个，与组 A 相同 ${sameSet(hl, nA)}；样式 前[${baseA}] 后[${styA}]`);
    rec.ev(await shot(page, 'TS-25-hover-A'));
    await page.mouse.move(pb.x, pb.y, { steps: 5 }); await sleep(400);
    hl = await highlightedNames(page);
    const styA2 = await tileStyle(page, nA[0]);
    rec.cp('2 指针移到组 B：组 B 全部突出显示，组 A 恢复原样式', sameSet(hl, nB) && styA2 === baseA, `突出显示与组 B 相同 ${sameSet(hl, nB)}（${hl.length}/${nB.length}）；组 A 样式恢复 ${styA2 === baseA}`);
    const out = await outsideBoard(page);
    await page.mouse.move(out.x, out.y, { steps: 5 }); await sleep(400);
    hl = await highlightedNames(page);
    rec.cp('3 指针移出棋盘：没有任何方块突出显示', hl.length === 0, `突出显示 ${hl.length} 个`);
    if (C) {
      const pc = center(s, C.cells[0]);
      await page.mouse.move(pc.x, pc.y, { steps: 5 }); await sleep(400);
      const h1 = await highlightedNames(page);
      await page.mouse.down(); await sleep(400);
      const h2 = await highlightedNames(page);
      await page.mouse.up(); await sleep(300);
      rec.cp('4 指针停在单个方块 C 上、以及在 C 上按住：没有任何方块突出显示', h1.length === 0 && h2.length === 0, `悬停 ${h1.length} 个，按住 ${h2.length} 个`);
    } else rec.log.push('没有单个方块，不报告检查点 4');
    await page.mouse.move(out.x, out.y); await sleep(300);
    s = await readBoard(page);
    const s0 = await state(page);
    await page.mouse.move(pa.x, pa.y, { steps: 5 }); await page.mouse.down(); await sleep(400);
    const h6 = await highlightedNames(page);
    const st6 = await tileStyle(page, nA[0]);
    await page.mouse.move(out.x, out.y, { steps: 8 }); await page.mouse.up();
    const u = await unchangedSince(page, s0, 1000);
    const h6b = await highlightedNames(page);
    const st6b = await tileStyle(page, nA[0]);
    rec.cp('6 在组 A 上按下保持：组 A 全部突出显示；移到棋盘外松开后恢复原样式且未被消除', sameSet(h6, nA) && st6 !== baseA && h6b.length === 0 && st6b === baseA && u.same,
      `按住时突出显示与组 A 相同 ${sameSet(h6, nA)}，样式不同 ${st6 !== baseA}；松开后突出 ${h6b.length} 个，样式恢复 ${st6b === baseA}；${u.obs}`);
    // empty cell: remove a group first so that a column gets shorter
    const g = bySize(removable(s)).at(-1);
    await removeGroup(page, e.st, g.cells, { before: s });
    s = await readBoard(page);
    const ec = emptyCell(s);
    if (ec) {
      await page.mouse.move(ec.x, ec.y, { steps: 5 }); await sleep(400);
      const h5 = await highlightedNames(page);
      rec.cp('5 指针停在棋盘上的空位：没有任何方块突出显示', h5.length === 0, `空位 第${ec.r}行第${ec.c}列，突出显示 ${h5.length} 个`);
    }
  });
}

// ---------- TS-26 ----------
export async function ts26() {
  await scenario('TS-26', '手机上手指按住时突出显示整组', async (rec, open) => {
    const e = await open('mobile');
    const { page } = e;
    const s = await readBoard(page);
    const A = bySize(removable(s)).at(-1);
    const nA = names(s, A.cells);
    const base = await tileStyle(page, nA[0]);
    const p = center(s, A.cells[0]);
    const t = await touch(page);
    const h0 = await hud(page);
    await t.down(p.x, p.y); await sleep(500);
    const hl = await highlightedNames(page);
    const sty = await tileStyle(page, nA[0]);
    rec.ev(await shot(page, 'TS-26-hold'));
    rec.cp('1 手指按住组 A 约 0.5 秒：组 A 全部突出显示、其他不突出，样式可见不同', sameSet(hl, nA) && sty !== base, `突出显示 ${hl.length}/${nA.length}，相同 ${sameSet(hl, nA)}；样式 前[${base}] 后[${sty}]`);
    await t.up();
    await sleep(300); await waitIdle(page); await sleep(300);
    const after = await readBoard(page); const h1 = await hud(page);
    const pred = predict(s, A.cells, e.st.R);
    const hl2 = await highlightedNames(page);
    const m = serialize(pred.snap) === serialize(after);
    rec.cp('2 在原方块上抬起：组 A 被消除，之后没有残留的突出显示', m && h1.score > h0.score && hl2.length === 0, `棋盘符合预测 ${m}，分数 ${h0.score}→${h1.score}，残留突出 ${hl2.length}`);
    const C = singles(after)[0];
    if (C) {
      const pc = center(after, C.cells[0]);
      const s0 = await state(page);
      await t.down(pc.x, pc.y); await sleep(500);
      const h3 = await highlightedNames(page);
      await t.up();
      const u = await unchangedSince(page, s0, 1500);
      rec.cp('3 手指按住单个方块：没有任何方块突出显示；抬起后棋盘不变', h3.length === 0 && u.same, `突出显示 ${h3.length} 个；${u.obs}`);
    }
  });
}

// ---------- TS-27 ----------
export async function ts27() {
  await scenario('TS-27', '消除、下落与加分的过渡动画', async (rec, open) => {
    const e = await open();
    const { page } = e;
    const s = await readBoard(page);
    const cands = bySize(removable(s)).reverse().filter((g) => hasTileAbove(s, g));
    const g = cands.find((x) => !emptiedColumns(s, x.cells).emptied.length) || cands[0];
    await sleep(300);
    const info = await removeGroup(page, e.st, g.cells, { before: s, sample: true });
    const a = info.sample;
    rec.ev(await shot(page, 'TS-27-after'));
    const o = `取样 ${a.frames} 帧；${remObs(info)}`;
    rec.cp('1 消除：被消除的方块消失前至少一次取样处于中间状态', a.removeMid, `${o}；中间状态 ${a.removeMid}`);
    rec.cp('2 下落：至少一个下落方块有一次取样位于原位置与新位置之间', a.fallers > 0 && a.fallMid, `${o}；下落方块 ${a.fallers} 个，中间位置 ${a.fallMid}`);
    rec.cp('3 加分：出现“+得分”文字，或分数显示经过中间值', a.plusText || a.scoreMid, `${o}；“+${info.gain}” 文字 ${a.plusText}，分数中间值 ${a.scoreMid}`);
  });
}

// ---------- TS-32 ----------
export async function ts32() {
  await scenario('TS-32', '静音按钮一键停止所有音效，再点恢复', async (rec, open) => {
    const e = await open();
    const { page } = e;
    let s = await readBoard(page);
    const sg = singles(s);
    if (sg.length) { await clickCell(page, s, ...sg[0].cells[0]); await sleep(500); }
    const vis = await muteBtn(page).isVisible();
    const pr0 = await muteBtn(page).getAttribute('aria-pressed');
    rec.cp('1 界面上有静音按钮，初始为有声（aria-pressed="false"）', vis && pr0 === 'false', `可见 ${vis}，aria-pressed=${pr0}`);
    const mb = await muteBtn(page).boundingBox();
    let res = null; const tries = [];
    for (let i = 0; i < 4 && !res; i++) {
      s = await readBoard(page);
      const g = bySize(removable(s)).at(-1);
      const before = await audioCounts(page);
      const p = center(s, g.cells[0]);
      await page.mouse.click(p.x, p.y);
      await page.waitForFunction((n) => window.__qaAudio.start > n, before.start, { polling: 'raf', timeout: 3000 }).catch(() => {});
      const mark = await page.evaluate(() => {
        const st = window.__qaAudio; const t = performance.now();
        return { t, active: [...st.nodes.entries()].filter(([, n]) => !n.ended).map(([id]) => id) };
      });
      await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
      await sleep(300);
      const chk = await page.evaluate(({ t, active }) => {
        const st = window.__qaAudio;
        return active.map((id) => { const n = st.nodes.get(id); return { id, stopAfter: n.stops.some((x) => x.t >= t), ended: n.ended, endedAt: n.endedAt }; });
      }, mark);
      const pressed = await muteBtn(page).getAttribute('aria-pressed');
      tries.push({ active: mark.active.length, chk, pressed });
      if (mark.active.length) res = { chk, pressed };
      else if (pressed === 'true') { await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2); await sleep(200); }
      await waitIdle(page);
    }
    if (!res) { rec.cp('2 音效播放中点静音：按钮变为已静音，正在播放的音源都收到停止调用', false, `4 次尝试中点静音时都没有正在播放的音源：${JSON.stringify(tries)}`); return; }
    rec.cp('2 音效播放中点静音：按钮变为已静音，正在播放的音源都收到停止调用', res.pressed === 'true' && res.chk.every((c) => c.stopAfter),
      `aria-pressed=${res.pressed}；点静音时正在播放的音源 ${res.chk.length} 个：${JSON.stringify(res.chk)}`);
    await waitIdle(page);
    const a0 = await audioCounts(page);
    const obs = []; let ok = true;
    for (let i = 0; i < 3; i++) {
      s = await readBoard(page); const g = bySize(removable(s))[0];
      const info = await removeGroup(page, e.st, g.cells, { before: s });
      if (!okRemoval(info)) ok = false;
      obs.push(remObs(info));
    }
    const a1 = await audioCounts(page);
    rec.cp('3 静音状态下再消除若干次：音源开始次数不增加，消除照常、分数照常增加', ok && a1.start === a0.start && a1.media === 0, `开始次数 ${a0.start}→${a1.start}，媒体播放 ${a1.media}；${obs.join('；')}`);
    await muteBtn(page).click(); await sleep(200);
    const pr2 = await muteBtn(page).getAttribute('aria-pressed');
    s = await readBoard(page);
    const info = await removeGroup(page, e.st, bySize(removable(s))[0].cells, { before: s });
    rec.cp('4 再点静音按钮：变回有声；此后消除一次，音源开始次数增加', pr2 === 'false' && info.a1.start > info.a0.start, `aria-pressed=${pr2}；开始次数 ${info.a0.start}→${info.a1.start}`);
    const m = await open('mobile');
    await muteBtn(m.page).tap(); await sleep(200);
    const t1 = await muteBtn(m.page).getAttribute('aria-pressed');
    await muteBtn(m.page).tap(); await sleep(200);
    const t2 = await muteBtn(m.page).getAttribute('aria-pressed');
    rec.cp('5 手机竖屏模拟下静音按钮可以轻点切换', t1 === 'true' && t2 === 'false', `轻点后 ${t1}，再轻点后 ${t2}`);
  });
}
