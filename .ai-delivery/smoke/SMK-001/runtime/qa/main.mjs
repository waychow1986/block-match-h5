// 冒烟用例（来自 TS-01）：用鼠标从打开页面玩到第 1 关结束，并确认结束提示画面。
import { desktopContext, openGame, closeBrowser, readBoard, hud, removable, waitDialog, dialog, sleep, now, shot } from './lib.mjs';
import { Rec, finish, flush } from './report.mjs';
import { removeGroup, describeDiff } from './play.mjs';

const LEVEL_CAP_MS = 6 * 60 * 1000;
const timeoutS = Number(process.env.QA_TIMEOUT_SECONDS) || 10 * 60;
flush();
setTimeout(async () => { flush(); await closeBrowser(); process.exit(0); }, Math.max(30, timeoutS - 30) * 1000).unref();

const rec = new Rec('TS-01', '鼠标从打开页面玩到第 1 关结束');
const log = [];
let page;
try {
  const ctx = await desktopContext();
  page = await openGame(ctx, log);
  await sleep(800);
  const h = await hud(page);
  let snap = await readBoard(page);
  rec.cp('1 打开页面直接看到棋盘与三项信息', snap.cells.size > 0 && h.score === 0 && h.level === 1 && h.target > 0, `方块数 ${snap.cells.size}，HUD ${JSON.stringify(h)}`);
  const st = { trace: [] };
  const bad = [];
  let moves = 0;
  const t0 = now();
  let capped = false;
  for (;;) {
    const gs = removable(snap);
    if (!gs.length) break;
    if (now() - t0 > LEVEL_CAP_MS) { capped = true; break; }
    const g = gs.sort((a, b) => b.size - a.size)[0];
    const info = await removeGroup(page, st, g.cells, { before: snap });
    moves++;
    if (!info.match || info.gain !== 10 * info.n * info.n || info.n !== g.size) bad.push(`第 ${moves} 次：消除 ${info.n}/${g.size}，得分 ${info.gain}（应为 ${10 * g.size * g.size}），棋盘符合预测 ${info.match}；${info.match ? '' : describeDiff(info.pred.snap, info.after)}`);
    snap = info.after;
  }
  log.push(...st.trace);
  if (capped) {
    rec.drop('第 1 关超过 6 分钟仍未结束，按测试计划不报告');
  } else {
    rec.cp('2 每次单击可消除组：组被消除、棋盘符合预测、分数按 10×n² 增加', bad.length === 0 && moves > 0, `共消除 ${moves} 次；不符合 ${bad.length} 次 ${bad.slice(0, 3).join('；')}`);
    const end = await hud(page);
    const d = await waitDialog(page, 8000);
    const name = d.cleared ? '过关' : '游戏结束';
    const txt = (d.cleared || d.over) ? await dialog(page, name).innerText() : '';
    const expectCleared = end.score >= end.target;
    rec.cp('3 没有可消除组后出现与分数相符的“过关”或“游戏结束”提示画面，并显示分数', (d.cleared !== d.over) && d.cleared === expectCleared && txt.includes(String(end.score)), `分数 ${end.score}，目标 ${end.target}，过关 ${d.cleared}，游戏结束 ${d.over}，画面文字：${txt.replace(/\s+/g, ' ')}`);
    rec.ev(await shot(page, 'smoke-level-end'));
  }
} catch (e) {
  rec.cp('脚本执行', false, `执行中出错：${e && e.message ? e.message.split('\n')[0] : e}`);
  log.push(String(e && e.stack || e));
}
finish(rec, log);
await closeBrowser();
process.exit(0);
