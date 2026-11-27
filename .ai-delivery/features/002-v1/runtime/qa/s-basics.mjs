// TS-01, TS-02, TS-03, TS-20, TS-30, TS-31, TS-32, TS-41, TS-42
import * as L from './lib.mjs';
import { withPage, skip, pressDialogButton, endButtonOf, fmtHud, noPressed } from './common.mjs';

const T01 = async (rec) => withPage(rec, {}, async (page) => {
  const h = await L.hud(page);
  const B = await L.readBoard(page);
  rec.cp('1 打开即可看到棋盘并开始交换，第 1 关', h.level === 1 && L.full(B) && (await L.board(page).isVisible()),
    `信息栏 ${fmtHud(h)}；棋盘方块 ${B.count} 个，可交换位置 ${L.allMoves(B.g).length} 处`);
  rec.ev(await L.shot(page, 'TS-01-open'));
  const r = await L.playToEnd(page, { pick: L.strong, how: 'gesture' }, 40);
  rec.log.push(...r.trace);
  if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
  rec.ev(await L.shot(page, 'TS-01-dialog'));
  rec.cp('2 只用鼠标走到本关结束，出现提示画面', ['过关', '本关失败'].includes(r.end), `${r.steps} 次有效交换后出现 dialog“${r.end}”：${r.last.dlg.text}`);
  const btn = endButtonOf(r.end);
  await pressDialogButton(page, btn);
  const d2 = await L.dialogState(page);
  const s = await L.play(page, { how: 'gesture' });
  rec.cp('3 点击按钮后提示画面消失，棋盘可再次交换', !d2 && !s.none && s.h1.moves === s.h0.moves - 1,
    `点击“${btn}”后提示画面${d2 ? '仍在：' + d2.name : '已消失'}；再交换一次：${s.none ? '无可交换位置' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
  rec.ev(await L.shot(page, 'TS-01-after'));
});

const T02 = async (rec) => withPage(rec, { mobile: true, storage: { 'swap-match.level': 5 } }, async (page) => {
  const r = await L.playToEnd(page, { pick: L.weak, how: 'gesture' }, 40);
  rec.log.push(...r.trace);
  if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
  rec.ev(await L.shot(page, 'TS-02-dialog'));
  rec.cp('1 只用手指走到本关结束，出现提示画面', ['过关', '本关失败'].includes(r.end), `${r.steps} 次手指滑动交换后出现 dialog“${r.end}”`);
  const btn = endButtonOf(r.end);
  await pressDialogButton(page, btn);
  const d2 = await L.dialogState(page);
  const h = await L.hud(page);
  const expLevel = btn === '下一关' ? 6 : 5;
  const s = await L.play(page, { how: 'select' });
  rec.cp('2 轻点按钮后提示画面消失，信息栏按按钮含义更新，仍能用手指交换',
    !d2 && h.level === expLevel && h.score === 0 && !s.none && s.h1.moves === s.h0.moves - 1,
    `轻点“${btn}”后提示画面${d2 ? '仍在' : '消失'}；信息栏 ${fmtHud(h)}（应为第 ${expLevel} 关、得分 0）；再轻点交换：${s.none ? '无' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
  rec.ev(await L.shot(page, 'TS-02-after'));
});

const T03 = async (rec) => {
  for (const lv of [1, 5, 6, 8]) {
    await withPage(rec, { storage: { 'swap-match.level': lv }, tag: `level${lv}` }, async (page) => {
      const boards = [await L.readBoard(page)];
      for (let i = 0; i < 10; i++) {
        const s = await L.play(page, { pick: L.randomPick });
        if (s.none || s.dlg) break;
        boards.push(s.A);
      }
      const bad = boards.map((B, i) => (L.full(B) ? null : `第 ${i} 次读数方块 ${B.count} 个、重复 ${B.dup}、无法解析 ${B.bad.length}`)).filter(Boolean);
      rec.cp(`1 第 ${lv} 关每次静止 8×8 共 64 个方块无空位`, bad.length === 0, bad.length ? bad.join('；') : `${boards.length} 次读数都齐全`);
      const first = L.colorsOf(boards[0]);
      const union = new Set(boards.flatMap((B) => [...L.colorsOf(B)]));
      const counts = boards.map((B) => L.colorsOf(B).size);
      rec.cp(`2 第 ${lv} 关颜色种类 5 或 6 且同关不变`, counts.every((n) => n === 5 || n === 6) && union.size <= 6 && first.size === union.size,
        `各次颜色数 ${counts.join(',')}；第一次 ${[...first].join('')}（${first.size}）；并集 ${[...union].join('')}（${union.size}）`);
    });
  }
};

const visibleNumeric = async (page) => {
  const out = [];
  for (const n of L.HUD_NAMES) {
    const loc = L.stat(page, n);
    const vis = (await loc.count()) === 1 && (await loc.isVisible());
    const txt = vis ? (await loc.textContent()).trim() : null;
    out.push({ n, ok: vis && /^\d+$/.test(txt), txt });
  }
  return out;
};
const T20 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const reads = [];
      const rd = async (when) => { const v = await visibleNumeric(page); reads.push({ when, v }); };
      await rd('载入后');
      const sums = [], stable = [], floatsOk = [];
      for (let i = 0; i < 10; i++) {
        const B = await L.readBoard(page);
        const ms = L.allMoves(B.g);
        if (!ms.length) break;
        const m = L.randomPick(ms);
        const h0 = await L.hud(page);
        const f0 = await L.floatsCount(page);
        await L.doSwap(page, B, m.a, m.b, 'gesture');
        try { await page.waitForFunction(() => document.querySelector('[role="group"][aria-label="棋盘"]').getAttribute('aria-busy') === 'true', null, { timeout: 1500, polling: 10 }); await rd(`第 ${i + 1} 次交换动画中`); } catch { /* not caught busy */ }
        await L.waitStill(page);
        await L.sleep(400);
        const dlg = await L.dialogState(page);
        const h1 = await L.hud(page);
        await rd(`第 ${i + 1} 次静止后`);
        const fl = await L.floatsSince(page, f0);
        const gains = fl.map((f) => parseInt(f.text.replace(/[^\d]/g, ''), 10));
        const sum = gains.reduce((a, b) => a + b, 0);
        sums.push({ i: i + 1, ok: h1.score === h0.score + sum && h1.moves === h0.moves - 1, o: `${h0.score}+${gains.join('+') || 0}=${h0.score + sum} 实为 ${h1.score}；步数 ${h0.moves}→${h1.moves}` });
        if (h1.score > h0.score) floatsOk.push({ i: i + 1, ok: gains.length >= 1, o: `浮字 ${fl.map((f) => f.text).join(' ') || '无'}` });
        await L.sleep(1000);
        const h2 = await L.hud(page);
        stable.push({ i: i + 1, ok: JSON.stringify(h1) === JSON.stringify(h2), o: `${fmtHud(h1)} / 1 秒后 ${fmtHud(h2)}` });
        if (dlg) break;
      }
      if (!mobile) {
        const r = await L.playToEnd(page, { pick: L.strong }, 40);
        if (r.end) { await rd(`提示画面“${r.end}”显示时`); rec.ev(await L.shot(page, 'TS-20-dialog')); }
      }
      const badReads = reads.filter((x) => x.v.some((y) => !y.ok));
      rec.cp(`1 ${tag}：每次读取五项都存在、可见、为数字`, badReads.length === 0,
        `共读取 ${reads.length} 次（含动画中 ${reads.filter((x) => x.when.includes('动画中')).length} 次）${badReads.length ? '；不符合：' + badReads.map((x) => x.when + ' ' + JSON.stringify(x.v)).join('；') : ''}`);
      rec.cp(`2 ${tag}：静止时得分 = 交换前 + 浮字之和，步数减 1`, sums.length > 0 && sums.every((x) => x.ok), sums.map((x) => `#${x.i} ${x.ok ? '' : '✗'}${x.o}`).join('；'));
      rec.cp(`3 ${tag}：静止后 1 秒再读数值不变`, stable.length > 0 && stable.every((x) => x.ok), stable.filter((x) => !x.ok).map((x) => x.o).join('；') || `${stable.length} 次都不变`);
      rec.cp(`4 ${tag}：每次有得分的交换都出现“+数字”浮字`, floatsOk.length > 0 && floatsOk.every((x) => x.ok), floatsOk.map((x) => `#${x.i} ${x.o}`).join('；'));
    });
  }
};

const T30 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const h1 = page.getByRole('heading', { level: 1 });
      const t = (await h1.count()) ? (await h1.first().innerText()).trim() : '';
      const hv = (await h1.count()) ? await h1.first().isVisible() : false;
      rec.cp(`1 ${tag}：有可见的一级标题且非空`, hv && t.length > 0, `一级标题“${t}”，可见=${hv}`);
      let region = page.getByRole('region', { name: '怎么玩' });
      if (!(await region.count())) region = page.locator('section,div,details,aside').filter({ has: page.getByText('怎么玩', { exact: true }) }).last();
      const txt = (await region.count()) ? (await region.first().innerText()).replace(/\s+/g, '') : '';
      const vis = (await region.count()) ? await region.first().isVisible() : false;
      const need = { 交换: /交换/, 相邻: /相邻/, '3 个及以上同色': /(3|三)个及以上同色/, 连成一线: /连成一线/, 静音: /静音/ };
      const miss = Object.entries(need).filter(([, re]) => !re.test(txt)).map(([k]) => k);
      rec.cp(`2/3 ${tag}：“怎么玩”说明可见且含交换、相邻、3 个及以上同色、连成一线、静音`, vis && miss.length === 0, `可见=${vis}；缺少：${miss.join('、') || '无'}；文字：${txt.slice(0, 300)}`);
      rec.ev(await L.shot(page, `TS-30-${mobile ? 'mobile' : 'desktop'}`));
    });
  }
};

const BANNED = ['Candy Crush', '糖果传奇', '开心消消乐', 'Bejeweled', '宝石迷阵', '梦幻家园', 'Homescapes', 'Gardenscapes', 'Toon Blast', 'Royal Match', '天天爱消除'];
const allText = (page) => page.evaluate(() => {
  const parts = [document.title, document.body.innerText];
  for (const e of document.querySelectorAll('*')) for (const a of ['aria-label', 'title', 'alt', 'aria-description', 'placeholder']) if (e.getAttribute(a)) parts.push(e.getAttribute(a));
  return parts.join('\n');
});
const T31 = async (rec) => {
  const found = [];
  let texts = 0;
  for (const mobile of [false, true]) {
    await withPage(rec, { mobile, storage: mobile ? { 'swap-match.level': 5 } : {} }, async (page) => {
      const tag = mobile ? 'mobile' : 'desktop';
      const check = async (when) => { const t = await allText(page); texts++; for (const b of BANNED) if (t.toLowerCase().includes(b.toLowerCase())) found.push(`${tag} ${when}: ${b}`); };
      await check('载入后');
      rec.ev(await L.shot(page, `TS-31-${tag}-board`));
      const r = await L.playToEnd(page, { pick: mobile ? L.weak : L.strong }, 40, async (s) => {
        if (L.colorsOf(s.A) && s.A.g.flat().some(L.special)) await check('出现特殊方块时');
      });
      if (r.end) { await check(`提示画面“${r.end}”`); rec.ev(await L.shot(page, `TS-31-${tag}-${r.end}`)); }
      rec.ev(await L.shot(page, `TS-31-${tag}-special`));
    });
  }
  rec.cp('页面标题与全部文字、可访问名称中不出现检查清单中的现有游戏名称', found.length === 0, `检查 ${texts} 次文字快照；${found.length ? '出现：' + found.join('；') : '未出现清单中的名称'}（图形与音效由业务负责人验收时目视确认）`);
};

const T32 = async (rec) => {
  const vals = {};
  for (const [k, storage] of [['A', { 'block-match.highScore': 99999 }], ['B', {}]]) {
    await withPage(rec, { storage, tag: k }, async (page) => { vals[k] = (await L.hud(page)).high; rec.ev(await L.shot(page, `TS-32-${k}`)); });
  }
  rec.cp('A（有旧记录 99999）与 B（无存储）都显示历史最高分 0', vals.A === 0 && vals.B === 0, `A 显示 ${vals.A}，B 显示 ${vals.B}`);
};

const boardBox = async (page) => page.evaluate(() => {
  const b = document.querySelector('[role="group"][aria-label="棋盘"]');
  const r = b.getBoundingClientRect();
  const tiles = [...b.querySelectorAll('button')].map((e) => e.getBoundingClientRect());
  const vw = document.documentElement.clientWidth;
  return { left: r.left, right: r.right, width: r.width, vw, iw: window.innerWidth, sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth, n: tiles.length,
    tilesIn: tiles.filter((t) => t.left >= -0.5 && t.right <= vw + 0.5 && t.width > 0).length, sx: window.scrollX };
});
const T41 = async (rec) => {
  const VPS = [[1280, 800, false], [1024, 768, false], [800, 600, false], [390, 844, true], [360, 640, true]];
  for (const [w, hgt, mobile] of VPS) {
    await withPage(rec, { mobile, viewport: { width: w, height: hgt }, tag: `${w}x${hgt}` }, async (page) => {
      await L.sleep(300);
      const b = await boardBox(page);
      rec.cp(`1 ${w}×${hgt}：64 个方块都在可视宽度内`, b.n === 64 && b.tilesIn === 64 && b.left >= -0.5 && b.right <= b.vw + 0.5, JSON.stringify(b));
      if (mobile) {
        await page.evaluate(() => window.scrollTo(500, window.scrollY));
        await L.sleep(200);
        const sx1 = await page.evaluate(() => window.scrollX);
        const B = await L.readBoard(page);
        const t = B.g[0][0];
        const y = Math.max(5, t.y - t.h * 1.5 - 20);
        await L.touchSwipe(page, w * 0.8, y, w * 0.1, y, 10);
        await L.sleep(400);
        const sx2 = await page.evaluate(() => window.scrollX);
        rec.cp(`3 ${w}×${hgt}：横向内容宽度不超过视口，尝试横向滚动后仍为 0`, b.sw <= b.vw && b.bsw <= b.vw && sx1 === 0 && sx2 === 0, `scrollWidth ${b.sw}/${b.bsw}，视口 ${b.vw}；脚本滚动后 scrollX=${sx1}，棋盘外横向滑动后 scrollX=${sx2}`);
      } else {
        rec.cp(`3 ${w}×${hgt}：横向内容宽度不超过视口`, b.sw <= b.vw && b.bsw <= b.vw, `scrollWidth ${b.sw}/${b.bsw}，视口 ${b.vw}`);
      }
      rec.ev(await L.shot(page, `TS-41-${w}x${hgt}`));
    });
  }
  await withPage(rec, { viewport: { width: 1280, height: 800 }, tag: 'resize' }, async (page) => {
    const a = await boardBox(page);
    await page.setViewportSize({ width: 800, height: 600 }); await L.sleep(500);
    const b = await boardBox(page);
    await page.setViewportSize({ width: 1280, height: 800 }); await L.sleep(500);
    const c = await boardBox(page);
    rec.cp('2 改变窗口大小后棋盘尺寸随之变化并完整显示', b.width <= a.width && b.width !== a.width && Math.abs(c.width - a.width) < 1 && [a, b, c].every((x) => x.tilesIn === 64 && x.sw <= x.vw),
      `1280×800 宽 ${a.width}；800×600 宽 ${b.width}（方块在内 ${b.tilesIn}）；改回 1280×800 宽 ${c.width}`);
  });
};

const T42 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      const B = await L.readBoard(page);
      // a cell connected (4-neighbour) to >= 2 same-colour cells
      let pick = null;
      for (let r = 0; r < 8 && !pick; r++) for (let c = 0; c < 8 && !pick; c++) {
        const col = B.g[r][c].color; if (!col) continue;
        const seen = new Set([r * 8 + c]); const st = [[r, c]];
        while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx > 7 || ny > 7 || seen.has(nx * 8 + ny) || B.g[nx][ny].color !== col) continue; seen.add(nx * 8 + ny); st.push([nx, ny]); } }
        if (seen.size >= 3) pick = [r, c];
      }
      if (!pick) skip('棋盘上没有与 2 个以上同色方块相连的方块');
      const h0 = await L.hud(page);
      await L.pressCell(page, B, pick);
      await L.sleep(2000);
      const A = await L.readBoard(page);
      const h1 = await L.hud(page);
      const pressed = A.g.flat().filter((t) => t.pressed === 'true').map((t) => t.name);
      const switches = await page.locator('button, a, [role=button], [role=link]').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').trim()).filter((t) => /玩法|模式/.test(t)));
      rec.ev(await L.shot(page, `TS-42-${mobile ? 'mobile' : 'desktop'}`));
      rec.cp(`${tag}：单点 ${L.P(...pick)} 不消除，棋盘、得分、步数不变，只显示选中，没有切换玩法入口`,
        L.sig(A) === L.sig(B) && h1.score === h0.score && h1.moves === h0.moves && pressed.length === 1 && pressed[0] === B.g[pick[0]][pick[1]].name && switches.length === 0,
        `棋盘${L.sig(A) === L.sig(B) ? '不变' : '有变化'}；${fmtHud(h0)} → ${fmtHud(h1)}；选中 ${pressed.join('、') || '无'}；含“玩法/模式”的按钮或链接：${switches.join('、') || '无'}`);
    });
  }
};

export default [
  { id: 'TS-01', title: '只用鼠标在电脑上完成一关', fn: T01 },
  { id: 'TS-02', title: '只用手指触摸在手机上完成一关', fn: T02 },
  { id: 'TS-03', title: '棋盘 8×8，颜色 5 或 6 种且同关不变', fn: T03 },
  { id: 'TS-20', title: '信息栏始终显示五项，且分数及时准确', fn: T20 },
  { id: 'TS-30', title: '标题与“怎么玩”说明', fn: T30 },
  { id: 'TS-31', title: '原创性：不使用现有游戏名称', fn: T31 },
  { id: 'TS-32', title: '历史最高分从 0 开始，不沿用旧玩法记录', fn: T32 },
  { id: 'TS-41', title: '棋盘随窗口缩放并完整显示，无横向滚动', fn: T41 },
  { id: 'TS-42', title: '只点一下单个方块不会消除', fn: T42 },
];
