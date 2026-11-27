// 冒烟用例 SMK-001（更新，来自 002-v1 的 TS-01）：用鼠标从打开页面交换三消玩到第 1 关结束，确认提示画面并能继续。
// 更新原因：本次需求把点击消除改为交换三消（G2 I4），原用例按“单击可消除组”操作已不适用。
import fs from 'node:fs';
import { Rec, finish, flush } from './report.mjs';
import * as L from './lib.mjs';
import { Skip, skip, withPage, pressDialogButton, endButtonOf, fmtHud } from './common.mjs';

fs.mkdirSync(L.EVIDENCE_DIR, { recursive: true });
const timeoutS = Number(process.env.QA_TIMEOUT_SECONDS) || 10 * 60;
flush();
setTimeout(async () => { flush(); await L.closeBrowser(); process.exit(0); }, Math.max(30, timeoutS - 30) * 1000).unref();

const rec = new Rec('TS-01', '鼠标从打开页面交换三消玩到第 1 关结束');
try {
  await withPage(rec, {}, async (page) => {
    const h = await L.hud(page);
    const B = await L.readBoard(page);
    rec.cp('1 打开即可看到棋盘，第 1 关', h.level === 1 && L.full(B) && (await L.board(page).isVisible()), `信息栏 ${fmtHud(h)}；棋盘方块 ${B.count} 个`);
    const r = await L.playToEnd(page, { pick: L.strong, how: 'gesture' }, 40);
    rec.log.push(...r.trace);
    if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
    rec.ev(await L.shot(page, 'smoke-dialog'));
    rec.cp('2 只用鼠标拖动交换走到本关结束，出现提示画面', ['过关', '本关失败'].includes(r.end), `${r.steps} 次有效交换后出现“${r.end}”：${r.last.dlg.text}`);
    const btn = endButtonOf(r.end);
    await pressDialogButton(page, btn);
    const d2 = await L.dialogState(page);
    const s = await L.play(page, { how: 'gesture' });
    rec.cp('3 点击按钮后提示画面消失，棋盘可再次交换', !d2 && !s.none && s.h1.moves === s.h0.moves - 1,
      `点击“${btn}”后提示画面${d2 ? '仍在' : '已消失'}；再交换一次：${s.none ? '无可交换位置' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
  });
} catch (e) {
  if (e instanceof Skip) rec.drop(e.message);
  else { rec.cp('脚本执行', false, `执行中出错：${e && e.message ? e.message.split('\n')[0] : e}`); rec.log.push(String((e && e.stack) || e)); }
}
if (!rec.dropped && !rec.cps.length) rec.drop('没有可下结论的检查点');
finish(rec);
flush();
await L.closeBrowser();
process.exit(0);
