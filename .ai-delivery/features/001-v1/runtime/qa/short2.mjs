// Short scenarios for AC-1/2/3: TS-02, TS-03 (a–e), TS-04, TS-05, TS-06, TS-07.
import {
  readBoard, hud, removable, singles, key, serialize, board, dialog, sleep, now, shot, clickCell, settle, waitIdle,
  isBusy, predict, groupAt, bySize, dims,
} from './lib.mjs';
import { removeGroup, describeDiff, fullBoardCheck, anyDialog, waitDialog } from './play.mjs';
import { finish, Rec } from './report.mjs';
import { LEVEL_CAP_MS, want, scenario, okRemoval, remObs, state, unchangedSince, center, emptyCell, touch, outsideBoard } from './short.mjs';

// ---------- TS-02 + TS-04: mobile, taps only ----------
export async function ts02and04() {
  if (!want('TS-02') && !want('TS-04')) return;
  const r04 = new Rec('TS-04', '手机上一次轻点即消除整组');
  const done04 = { two: false, three: false };
  await scenario('TS-02', '手机竖屏用触摸玩到本关结束', async (rec, open) => {
    const e = await open('mobile');
    const { page } = e;
    let h = await hud(page);
    const login = await page.getByRole('textbox').count() + await page.getByRole('button', { name: /登录|注册/ }).count();
    rec.cp('1 打开页面直接看到棋盘与三项信息，没有登录或注册', e.snap.cells.size > 0 && [h.score, h.target, h.level].every(Number.isFinite) && login === 0, `方块 ${e.snap.cells.size}，HUD ${JSON.stringify(h)}，登录/注册控件 ${login}`);
    const t0 = now(); let taps = 0; const bad = [];
    while (true) {
      if (now() - t0 > LEVEL_CAP_MS) { rec.drop('6 分钟内没有出现提示画面'); r04.log.push('6 min cap'); return; }
      const s = await readBoard(page); const gs = removable(s);
      if (!gs.length) break;
      let g = null, kind = null;
      if (!done04.two) { g = gs.find((x) => x.size === 2); kind = 'two'; }
      if (!g && !done04.three) { g = bySize(gs).reverse().find((x) => x.size >= 3); kind = 'three'; }
      if (!g) { g = bySize(gs)[0]; kind = null; }
      const info = await removeGroup(page, e.st, g.cells, { before: s, how: 'tap' });
      taps++;
      if (!okRemoval(info)) bad.push(`第 ${taps} 次轻点：${remObs(info)}`);
      if (kind === 'two' && g.size === 2) { done04.two = true; r04.cp('1 轻点 2 个方块的组一次：棋盘等于预测棋盘、分数增加', okRemoval(info), remObs(info)); }
      if (kind === 'three' && g.size >= 3) { done04.three = true; r04.cp('2 轻点 3 个以上方块的组一次：棋盘等于预测棋盘、分数增加', okRemoval(info), remObs(info)); }
    }
    rec.cp('2 每个可消除组都是一次轻点即被消除，分数增加', taps > 0 && bad.length === 0, `共轻点 ${taps} 次，不符合 ${bad.length} 次 ${bad.slice(0, 3).join('；')}`);
    const d = await waitDialog(page, 8000);
    h = await hud(page);
    rec.ev(await shot(page, 'TS-02-level-end'));
    rec.cp('3 没有可消除组后出现“过关”或“游戏结束”提示画面之一', d.cleared !== d.over, `分数 ${h.score}，目标 ${h.target}，${JSON.stringify(d)}`);
  });
  if (want('TS-04')) {
    if (!r04.cps.length) r04.drop('没有完成轻点检查');
    finish(r04);
  }
}

// ---------- TS-03 a–e (f comes from game A) ----------
function classify(snap, g) {
  const set = new Set(g.cells.map(([r, c]) => key(r, c)));
  const rs = new Set(g.cells.map((x) => x[0])), cs = new Set(g.cells.map((x) => x[1]));
  const diag = [];
  for (const [r, c] of g.cells) for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const t = snap.cells.get(key(r + dr, c + dc));
    if (t && t.color === g.color && !set.has(key(t.r, t.c))) diag.push(key(t.r, t.c));
  }
  const elsewhere = [...snap.cells.values()].filter((t) => t.color === g.color && !set.has(key(t.r, t.c))).map((t) => key(t.r, t.c));
  const minC = Math.min(...cs), maxR = Math.max(...rs);
  const inner = g.cells.filter(([r, c]) => c !== minC && r !== maxR);
  return {
    a: g.size === 2, b: g.size >= 3 && (rs.size === 1 || cs.size === 1), c: g.size >= 3 && rs.size > 1 && cs.size > 1 && inner.length > 0,
    d: diag.length > 0, e: elsewhere.length > 0, diag, elsewhere, inner,
  };
}

export async function ts03() {
  return scenario('TS-03', '整组且只有这一组被消除', async (rec, open) => {
    const e = await open();
    const { page } = e;
    const labels = {
      a: 'a 恰好 2 个方块的组', b: 'b 3 个以上排成直线的组', c: 'c 弯折的组（单击的不是最左或最下的方块）',
      d: 'd 组旁有只斜向相邻的同色方块', e: 'e 别处有同色但不相连的方块',
    };
    const need = new Set(['c', 'd', 'b', 'a', 'e']);
    const t0 = now();
    while (need.size && now() - t0 < LEVEL_CAP_MS) {
      const s = await readBoard(page); const gs = removable(s);
      if (!gs.length) {
        const d = await waitDialog(page, 8000);
        if (d.cleared) await dialog(page, '过关').getByRole('button', { name: '下一关', exact: true }).click();
        else if (d.over) await dialog(page, '游戏结束').getByRole('button', { name: '重新开始', exact: true }).click();
        else break;
        await sleep(400); await settle(page, 300); continue;
      }
      let pick = null;
      for (const cat of need) {
        const g = gs.find((x) => classify(s, x)[cat]);
        if (g) { pick = { cat, g, cl: classify(s, g) }; break; }
      }
      if (!pick) { await removeGroup(page, e.st, bySize(gs).at(-1).cells, { before: s }); continue; }
      const { cat, g, cl } = pick;
      const click = cat === 'c' ? cl.inner[0] : g.cells[Math.floor(g.cells.length / 2)];
      const info = await removeGroup(page, e.st, g.cells, { before: s, clickCell: click });
      // survivors that must remain (d: diagonal, e: elsewhere) — their predicted positions must hold the same colour
      const keep = cat === 'd' ? cl.diag : cat === 'e' ? cl.elsewhere : [];
      const kept = keep.every((k) => { const nk = info.pred.map.get(k); const t = nk && info.after.cells.get(nk); return t && t.color === g.color; });
      rec.cp(`${labels[cat]}：棋盘等于预测棋盘、方块减少 ${g.size}、分数增加${keep.length ? '、同色方块仍在' : ''}`, okRemoval(info) && kept,
        `点击 ${click}（组 ${JSON.stringify(g.cells)}）；${remObs(info)}${keep.length ? `；需保留的同色方块 ${keep.join(' ')} 仍在 ${kept}` : ''}`);
      need.delete(cat);
    }
    for (const cat of need) rec.log.push(`形态 ${cat} 在等待上限内未出现，不报告该检查点`);
  }, { defer: true });
}

// ---------- TS-05 ----------
export async function ts05() {
  await scenario('TS-05', '按下后移到别处再松开不消除', async (rec, open) => {
    const e = await open();
    const { page } = e;
    let s = await readBoard(page);
    let [A, B] = bySize(removable(s)).reverse();
    let a = center(s, A.cells[0]), b = center(s, B.cells[0]);
    let s0 = await state(page);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    let u = await unchangedSince(page, s0, 1500);
    rec.cp('1 鼠标在组 A 按下、移到组 B 松开：棋盘与分数不变', u.same, u.obs);
    const out = await outsideBoard(page);
    s0 = await state(page);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(out.x, out.y, { steps: 8 }); await page.mouse.up();
    u = await unchangedSince(page, s0, 1500);
    rec.cp('2 鼠标在组 A 按下、移到棋盘外松开：棋盘与分数不变', u.same, u.obs + `；松开位置 ${JSON.stringify(out)}`);
    s = await readBoard(page);
    const info = await removeGroup(page, e.st, A.cells, { before: s });
    rec.cp('4 对照：随后在组 A 上正常单击，组 A 被消除', okRemoval(info), remObs(info));
    // mobile
    const m = await open('mobile');
    const mp = m.page;
    s = await readBoard(mp);
    [A, B] = bySize(removable(s)).reverse();
    a = center(s, A.cells[0]); b = center(s, B.cells[0]);
    const t = await touch(mp);
    s0 = await state(mp);
    await t.down(a.x, a.y); await sleep(150); await t.move(a.x, a.y, b.x, b.y); await t.up();
    const u1 = await unchangedSince(mp, s0, 1500);
    const mo = await outsideBoard(mp);
    s0 = await state(mp);
    await t.down(a.x, a.y); await sleep(150); await t.move(a.x, a.y, mo.x, mo.y); await t.up();
    const u2 = await unchangedSince(mp, s0, 1500);
    rec.cp('3 手机模拟：按住组 A 移到组 B 或棋盘外再抬起，棋盘与分数不变', u1.same && u2.same, `移到组 B：${u1.obs}；移到棋盘外：${u2.obs}`);
  });
}

// ---------- TS-06 ----------
export async function ts06() {
  await scenario('TS-06', '连续快速点击与动画中点击只生效一次', async (rec, open) => {
    const e = await open();
    const { page } = e;
    let s = await readBoard(page);
    const gs = bySize(removable(s));
    const A = gs.find((g) => g.size === 2) || gs[0];
    let p = center(s, A.cells[0]);
    let h0 = await hud(page);
    await page.mouse.click(p.x, p.y); await sleep(120);
    const busy1 = await isBusy(page);
    await page.mouse.click(p.x, p.y);
    await waitIdle(page); await sleep(1500); await waitIdle(page);
    let after = await readBoard(page); let h1 = await hud(page);
    let pred = predict(s, A.cells, e.st.R);
    const gain1 = h1.score - h0.score;
    const m1 = serialize(pred.snap) === serialize(after);
    // gain of a single ordinary removal of the same size, for comparison
    let ref = null;
    {
      const g2 = bySize(removable(after)).find((g) => g.size === A.size);
      if (g2) { const i = await removeGroup(page, e.st, g2.cells, { before: after }); ref = i.gain; }
    }
    rec.cp('1 组 A 上快速连续单击两次：棋盘等于只消除组 A 一次的预测棋盘，分数只增加一次组 A 的得分', m1 && gain1 > 0 && (ref === null || gain1 === ref),
      `第二次单击时动画进行中 ${busy1}；组 A ${A.size} 个；棋盘符合预测 ${m1}${m1 ? '' : '：' + describeDiff(pred.snap, after)}；分数增加 ${gain1}；同大小单次消除得分 ${ref}`);
    // cp2
    s = await readBoard(page);
    const g2s = bySize(removable(s));
    let pair = null;
    for (const a of g2s) for (const b of g2s) {
      if (a === b || pair) continue;
      const pr = predict(s, a.cells, e.st.R);
      const ok = b.cells.every(([r, c]) => !!pr.map.get(key(r, c)));
      if (ok) pair = [a, b, pr];
    }
    const [GA, GB, pr] = pair;
    const pa = center(s, GA.cells[0]), pb = center(s, GB.cells[0]);
    h0 = await hud(page);
    await page.mouse.click(pa.x, pa.y); await sleep(100);
    const busy2 = await isBusy(page);
    await page.mouse.click(pb.x, pb.y);
    await waitIdle(page); await sleep(1500); await waitIdle(page);
    after = await readBoard(page); h1 = await hud(page);
    const m2 = serialize(pr.snap) === serialize(after);
    const gainA = h1.score - h0.score;
    // B after A's removal (at its fallen position)
    const bCells = GB.cells.map(([r, c]) => pr.map.get(key(r, c)).split(',').map(Number));
    const bStill = bCells.every(([r, c]) => after.cells.get(key(r, c))?.color === GB.color);
    const ga = await removeGroup(page, e.st, groupAt(after, ...bCells[0]), { before: after });
    const gk = new Set(ga.group.map(([r, c]) => key(r, c)));
    const bGone = bCells.every(([r, c]) => gk.has(key(r, c)));
    rec.cp('2 单击组 A 后在动画中单击组 B：组 B 仍在、分数只增加组 A 的得分；动画后再单击组 B，组 B 被消除',
      m2 && bStill && gainA > 0 && okRemoval(ga) && bGone,
      `单击 B 时动画进行中 ${busy2}；棋盘等于只消除 A 的预测 ${m2}${m2 ? '' : '：' + describeDiff(pr.snap, after)}；B 仍在 ${bStill}；分数增加 ${gainA}；再单击 B：${remObs(ga)}`);
  });
}

// ---------- TS-07 ----------
function diagSingle(snap) {
  return singles(snap).find((g) => { const [r, c] = g.cells[0]; return [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dr, dc]) => snap.cells.get(key(r + dr, c + dc))?.color === g.color); });
}
export async function ts07() {
  await scenario('TS-07', '点击单个方块或空位不产生变化', async (rec, open) => {
    const e = await open();
    const { page } = e;
    let s = await readBoard(page);
    let sg = singles(s);
    if (!sg.length) { rec.drop('棋盘上没有单个方块'); return; }
    let s0 = await state(page);
    await clickCell(page, s, ...sg[0].cells[0]);
    let u = await unchangedSince(page, s0);
    rec.cp('1 单击单个方块：棋盘、分数不变，不出现提示画面', u.same && !u.dlg, `单个方块 ${sg[0].cells[0]}；${u.obs}`);
    const ds = diagSingle(s);
    if (ds) {
      s0 = await state(page);
      await clickCell(page, s, ...ds.cells[0]);
      u = await unchangedSince(page, s0);
      rec.cp('2 单击斜向有同色方块的单个方块：同 1', u.same && !u.dlg, `单个方块 ${ds.cells[0]}；${u.obs}`);
    } else rec.log.push('没有斜向有同色方块的单个方块，不报告检查点 2');
    s = await readBoard(page);
    const g = bySize(removable(s)).at(-1);
    const info = await removeGroup(page, e.st, g.cells, { before: s });
    rec.cp('4 对照：随后单击可消除组，该组被消除、分数增加', okRemoval(info), remObs(info));
    s = await readBoard(page);
    const ec = emptyCell(s);
    if (ec) {
      s0 = await state(page);
      const bb = await board(page).boundingBox();
      const inside = ec.x > bb.x && ec.x < bb.x + bb.width && ec.y > bb.y && ec.y < bb.y + bb.height;
      await page.mouse.click(ec.x, ec.y);
      u = await unchangedSince(page, s0);
      rec.cp('5 单击棋盘范围内的空位：棋盘与分数不变', inside && u.same && !u.dlg, `空位 第${ec.r}行第${ec.c}列（${Math.round(ec.x)},${Math.round(ec.y)}，在棋盘内 ${inside}）；${u.obs}`);
    }
    const m = await open('mobile');
    const ms = await readBoard(m.page);
    const msg = singles(ms);
    if (msg.length) {
      s0 = await state(m.page);
      await clickCell(m.page, ms, ...msg[0].cells[0], 'tap');
      u = await unchangedSince(m.page, s0);
      rec.cp('3 手机模拟轻点单个方块：棋盘、分数不变，不出现提示画面', u.same && !u.dlg, `单个方块 ${msg[0].cells[0]}；${u.obs}`);
    }
  });
}
