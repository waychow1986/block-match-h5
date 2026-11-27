// AC-15 layout scenarios: TS-34 (desktop window sizes), TS-35 (mobile portrait).
import { readBoard, hud, removable, serialize, board, muteBtn, sleep, layoutCheck, visibleAll, bySize, shot, stat, waitIdle } from './lib.mjs';
import { removeGroup } from './play.mjs';
import { scenario, okRemoval, remObs } from './short.mjs';

const lc = (l) => `内容宽 ${l.scrollWidth}/可视宽 ${l.clientWidth}，横向滚动 ${l.scrollXAfter}，棋盘 [${Math.round(l.boardLeft)},${Math.round(l.boardRight)}] 宽 ${Math.round(l.boardWidth)}，越界方块 ${l.tilesOut}`;

export async function ts34() {
  await scenario('TS-34', '电脑上改变窗口大小', async (rec, open) => {
    const sizes = [[1440, 900], [1024, 768], [600, 800], [375, 700]];
    const widths = [];
    for (const [w, h] of sizes) {
      const e = await open('desktop', { width: w, height: h });
      const l = await layoutCheck(e.page);
      const v = await visibleAll(e.page);
      widths.push(l.boardWidth);
      rec.ev(await shot(e.page, `TS-34-${w}x${h}`));
      rec.cp(`1（${w}×${h}）打开页面：无横向溢出与滚动、棋盘与方块在可视宽度内；四项信息与静音按钮可见`, l.ok && Object.values(v).every(Boolean), `${lc(l)}；可见 ${JSON.stringify(v)}`);
      if (w === 375) {
        await e.page.mouse.move(w / 2, h / 2);
        await e.page.mouse.wheel(400, 0); await sleep(300);
        await e.page.evaluate(() => window.scrollBy(300, 0)); await sleep(200);
        const sx = await e.page.evaluate(() => window.scrollX);
        rec.cp('5 375×700 下尝试横向滚动：横向滚动位置为 0', sx === 0, `滚轮横向 400 与 scrollBy(300,0) 后 scrollX=${sx}`);
      }
      await e.ctx.close();
    }
    const nonInc = widths.every((x, i) => i === 0 || x <= widths[i - 1] + 0.5);
    rec.cp('2 窗口由宽变窄时棋盘显示宽度随之变小（缩放而非裁切）', nonInc && widths.at(-1) < widths[0] - 1, `各尺寸棋盘宽度 ${widths.map((x) => Math.round(x)).join(' → ')}（各尺寸方块都在可视宽度内见检查点 1）`);
    // resize during a game
    const e = await open('desktop', { width: 1440, height: 900 });
    const { page } = e;
    for (let i = 0; i < 2; i++) { const s = await readBoard(page); await removeGroup(page, e.st, bySize(removable(s))[0].cells, { before: s }); }
    const snapState = async () => ({ s: serialize(await readBoard(page)), h: await hud(page) });
    const s0 = await snapState();
    const obs = []; let okL = true, same = true;
    for (const [w, h] of [[600, 800], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(600);
      const l = await layoutCheck(page);
      const s1 = await snapState();
      okL = okL && l.ok;
      const eq = s1.s === s0.s && s1.h.score === s0.h.score && s1.h.level === s0.h.level;
      same = same && eq;
      obs.push(`${w}×${h}：${lc(l)}；棋盘${s1.s === s0.s ? '不变' : '改变'}，分数 ${s0.h.score}→${s1.h.score}，关卡 ${s0.h.level}→${s1.h.level}`);
    }
    rec.cp('3 游戏进行中把窗口从 1440×900 改到 600×800 再改回：每个尺寸都满足判定', okL, obs.join('；'));
    rec.cp('6 改变窗口大小前后棋盘内容、当前分数、当前关卡都不变', same, obs.join('；'));
    const s = await readBoard(page);
    const info = await removeGroup(page, e.st, bySize(removable(s))[0].cells, { before: s });
    rec.cp('4 改变大小后单击可消除组仍能正常消除', okRemoval(info), remObs(info));
  });
}

export async function ts35() {
  await scenario('TS-35', '手机竖屏', async (rec, open) => {
    for (const [w, h] of [[412, 915], [360, 740], [320, 568]]) {
      const e = await open('mobile', { width: w, height: h });
      const { page } = e;
      const l = await layoutCheck(page);
      const sb = await stat(page, '当前分数').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(w / 2), y: Math.round(sb ? sb.y + sb.height / 2 : 20), xDistance: -250, yDistance: 0, gestureSourceType: 'touch', speed: 800 }).catch((x) => e.st.trace.push(`swipe error ${x.message}`));
      await sleep(400);
      const sx = await page.evaluate(() => window.scrollX);
      rec.ev(await shot(page, `TS-35-${w}x${h}`));
      rec.cp(`1（${w}×${h}）无横向溢出、棋盘与方块在可视宽度内；横向滑动后横向滚动位置仍为 0`, l.ok && sx === 0, `${lc(l)}；滑动后 scrollX=${sx}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const v = await visibleAll(page);
      await muteBtn(page).tap(); await sleep(200);
      const t1 = await muteBtn(page).getAttribute('aria-pressed');
      await muteBtn(page).tap(); await sleep(200);
      const t2 = await muteBtn(page).getAttribute('aria-pressed');
      rec.cp(`2（${w}×${h}）四项信息与静音按钮可见；静音按钮可轻点切换`, Object.values(v).every(Boolean) && t1 === 'true' && t2 === 'false', `可见 ${JSON.stringify(v)}；轻点后 ${t1}，再轻点后 ${t2}`);
      await waitIdle(page);
      const s = await readBoard(page);
      const info = await removeGroup(page, e.st, bySize(removable(s)).at(-1).cells, { before: s, how: 'tap' });
      const shown = await stat(page, '当前分数').isVisible();
      rec.cp(`3（${w}×${h}）轻点可消除组能消除，分数增加并显示`, okRemoval(info) && shown, `${remObs(info)}；分数可见 ${shown}`);
      await e.ctx.close();
    }
  });
}
