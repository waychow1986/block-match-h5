// 冒烟候选 CAND-01（来自 002-v1 的 TS-02）：手机只用手指滑动交换玩到一关结束，轻点按钮后继续用手指交换。
import fs from 'node:fs';
import { Rec, finish, flush } from './report.mjs';
import * as L from './lib.mjs';
import { Skip, skip, withPage, pressDialogButton, endButtonOf, fmtHud } from './common.mjs';

fs.mkdirSync(L.EVIDENCE_DIR, { recursive: true });
const timeoutS = Number(process.env.QA_TIMEOUT_SECONDS) || 10 * 60;
flush();
setTimeout(async () => { flush(); await L.closeBrowser(); process.exit(0); }, Math.max(30, timeoutS - 30) * 1000).unref();

const rec = new Rec('TS-02', '手机只用手指完成一关');
try {
  // 预置第 5 关（本机存储，仅本用例的全新上下文），用弱策略较快走到本关结束
  await withPage(rec, { mobile: true, storage: { 'swap-match.level': 5 } }, async (page) => {
    const r = await L.playToEnd(page, { pick: L.weak, how: 'gesture' }, 40);
    rec.log.push(...r.trace);
    if (!r.end) skip('40 次有效交换内未出现提示画面（测试等待上限）');
    rec.ev(await L.shot(page, 'smoke-dialog'));
    rec.cp('1 只用手指滑动交换走到本关结束，出现提示画面', ['过关', '本关失败'].includes(r.end), `${r.steps} 次手指滑动交换后出现“${r.end}”`);
    const btn = endButtonOf(r.end);
    await pressDialogButton(page, btn);
    const d2 = await L.dialogState(page);
    const h = await L.hud(page);
    const expLevel = btn === '下一关' ? 6 : 5;
    const s = await L.play(page, { how: 'select' });
    rec.cp('2 轻点按钮后提示画面消失，信息栏按按钮含义更新，仍能用手指交换',
      !d2 && h.level === expLevel && h.score === 0 && !s.none && s.h1.moves === s.h0.moves - 1,
      `轻点“${btn}”后提示画面${d2 ? '仍在' : '消失'}；信息栏 ${fmtHud(h)}；再轻点交换：${s.none ? '无' : fmtHud(s.h0) + ' → ' + fmtHud(s.h1)}`);
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
