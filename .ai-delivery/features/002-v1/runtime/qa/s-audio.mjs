// TS-35 .. TS-39
import * as L from './lib.mjs';
import { withPage, skip, fmtHud } from './common.mjs';

const fmtStarts = (ss) => (ss.length ? ss.map((s) => `${s.state}${s.audible ? '' : '(不可听)'}`).join(',') : '无');

// Play to the end, collecting per-step removal starts and dialog starts.
async function playCollect(page, pick, how, cap = 40) {
  const steps = [];
  let dlgStarts = null, dlgName = null;
  let k0 = (await L.audio(page)).starts.length;
  const r = await L.playToEnd(page, { pick, how }, cap, async (s, i) => {
    await L.sleep(150);
    const a = await L.audio(page);
    const ss = a.starts.slice(k0);
    k0 = a.starts.length;
    const fl = await page.evaluate(() => window.__qa.floats.map((f) => f.t));
    const lastF = Math.max(0, ...fl);
    if (s.dlg) {
      dlgName = s.dlg.name;
      dlgStarts = ss.filter((x) => x.t > lastF + 200);
      steps.push({ i, removal: s.floats.length > 0, starts: ss.filter((x) => x.t <= lastF + 200) });
    } else steps.push({ i, removal: s.floats.length > 0, starts: ss });
  });
  return { r, steps, dlgStarts, dlgName };
}
// Up to n fresh pages until the wanted end dialog is reached (each page keeps the 40-swap cap).
const retry = async (n, fn) => { const st = { done: false }; for (let k = 1; k <= n && !st.done; k++) await fn(k, st); };
const removalOk = (st) => st.starts.some((x) => x.state === 'running' && x.audible);
const stepsInfo = (steps) => steps.filter((s) => s.removal).map((s) => `#${s.i + 1}:${fmtStarts(s.starts)}`).join('；');

const T35 = async (rec) => {
  await Promise.all([[1, L.strong, '过关'], [5, L.weak, '本关失败']].map(([lv, pick, want]) => retry(lv === 1 ? 1 : 3, (k, st) => withPage(rec, { storage: lv > 1 ? { 'swap-match.level': lv } : undefined, tag: `level${lv}-${k}` }, async (page) => {
    const c = await playCollect(page, pick, 'gesture');
    const rm = c.steps.filter((s) => s.removal);
    if (lv === 1) rec.cp('1 每次发生消除时都有新的音源开始播放（音频环境运行中）', rm.length > 0 && rm.every(removalOk), `第 1 关 ${rm.length} 次消除：${stepsInfo(c.steps)}`);
    if (c.dlgName !== want) { rec.log.push(`第 ${lv} 关第 ${k} 个页面未出现${want}画面（${c.dlgName || '无'}）${k < 3 && lv > 1 ? '，换全新页面重试' : '，检查点不报告'}`); return; }
    st.done = true;
    const ok = c.dlgStarts.some((x) => x.state === 'running' && x.audible);
    rec.cp(lv === 1 ? '2 过关画面出现时有新的音源开始播放' : '3 失败画面出现时有新的音源开始播放', ok, `${want}画面出现时新开始的音源：${fmtStarts(c.dlgStarts)}`);
  }))));
};

async function clickMute(page) {
  const bb = await L.muteBtn(page).boundingBox();
  if (page.__mobile) await L.touchTap(page, bb.x + bb.width / 2, bb.y + bb.height / 2);
  else await L.mouseClick(page, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await L.sleep(100);
}
async function audibleStartsDuring(page, n, how) {
  const a0 = await L.audio(page);
  let done = 0;
  for (let i = 0; i < n * 3 && done < n; i++) {
    const s = await L.play(page, { how });
    if (s.none || s.dlg) break;
    if (s.floats.length) done++;
  }
  await L.sleep(200);
  const a1 = await L.audio(page);
  const ss = a1.starts.slice(a0.starts.length);
  return { done, ss, audible: ss.filter((x) => x.audible && x.state === 'running'), outMuted: a1.outMuted, ctx: a1.ctxStates.join(',') };
}

const T36 = async (rec) => {
  for (const mobile of [false, true]) {
    const tag = mobile ? '手机' : '电脑';
    await withPage(rec, { mobile }, async (page) => {
      if ((await L.muteBtn(page).getAttribute('aria-pressed')) !== 'false') skip('静音按钮初始不是未静音');
      const B = await L.readBoard(page);
      const m = L.strong(L.allMoves(B.g));
      const f0 = await L.floatsCount(page);
      await L.gesture(page, B, m.a, m.b);
      let a1, ft = null;
      for (let i = 0; i < 80; i++) {
        await L.sleep(20);
        if (ft === null) { const fs = await L.floatsSince(page, f0); if (fs.length) ft = fs[0].t - 50; else continue; }
        a1 = await L.audio(page);
        if (a1.starts.some((x) => x.t >= ft)) break;
      }
      if (!a1 || !a1.starts.some((x) => x.t >= ft)) skip('消除后没有音效开始，无法在播放中点静音');
      await L.sleep(30);
      await clickMute(page);
      const a2 = await L.audio(page);
      const pressed = await L.muteBtn(page).getAttribute('aria-pressed');
      const stopped = a2.stops > a1.stops || a2.outMuted || a2.ctxStates.every((s) => s !== 'running');
      rec.cp(`${tag} 1 点静音后按钮处于静音，正在播放的音效立即停止`, pressed === 'true' && stopped, `aria-pressed=${pressed}；停止调用 ${a1.stops}→${a2.stops}，输出静音 ${a2.outMuted}，音频环境 ${a2.ctxStates.join(',')}`);
      await L.settle(page);
      const q = await audibleStartsDuring(page, 3, 'gesture');
      const silent = q.audible.length === 0 || q.outMuted;
      rec.cp(`${tag} 2 静音期间的消除不产生可听音效`, q.done === 3 && silent, `静音期间 ${q.done} 次消除；新开始音源 ${fmtStarts(q.ss)}；输出静音 ${q.outMuted}；音频环境 ${q.ctx}`);
      await clickMute(page);
      const p2 = await L.muteBtn(page).getAttribute('aria-pressed');
      const q2 = await audibleStartsDuring(page, 2, 'gesture');
      rec.cp(`${tag} 3 再点后不在静音，之后的消除重新有音效`, p2 === 'false' && q2.done === 2 && q2.audible.length > 0 && !q2.outMuted, `aria-pressed=${p2}；恢复后 ${q2.done} 次消除；新开始音源 ${fmtStarts(q2.ss)}；输出静音 ${q2.outMuted}`);
    });
  }
};

const firstTouch = (how, tag) => async (rec) => withPage(rec, { mobile: true, strict: true }, async (page) => {
  const res = [];
  for (let k = 0; k < 4; k++) {
    const a0 = await L.audio(page);
    const s = await L.play(page, { how });
    if (s.none || s.dlg) break;
    await L.sleep(250);
    const a1 = await L.audio(page);
    const ss = a1.starts.slice(a0.starts.length);
    // A start while suspended counts when the context is resumed in an activation event shortly after (design TD-010: scheduled notes play on resume)
    const deferred = (x) => x.state === 'suspended' && a1.resumes.some((r) => r.inAct && r.t >= x.t && r.t - x.t < 1500) && a1.ctxStates.includes('running');
    res.push({ k, removal: s.floats.length > 0, ss, ok: ss.some((x) => (x.audible && x.state === 'running') || deferred(x)), ctx: a1.ctxStates.join(','), resumes: a1.resumes.map((r) => `${r.ev}${r.inAct ? '' : '(非激活)'}`).join(',') });
  }
  if (!res.length || !res[0].removal) skip('第一次操作未发生消除');
  const f = res[0];
  rec.cp(`1 第一次${tag}消除时音频处于可发声状态，有音源开始播放`, f.ok, `新开始音源 ${fmtStarts(f.ss)}；音频环境 ${f.ctx || '未创建'}；resume 调用 ${f.resumes || '无'}`);
  const rest = res.slice(1).filter((x) => x.removal);
  if (rest.length) rec.cp('2 之后每次消除也都有音效', rest.length === 3 && rest.every((x) => x.ok), rest.map((x) => `#${x.k + 1}:${fmtStarts(x.ss)}`).join('；'));
  rec.ev(await L.shot(page, `${tag === '滑动' ? 'TS-37' : 'TS-38'}-end`));
});

const T39 = async (rec) => {
  await Promise.all([[1, L.strong, '过关'], [5, L.weak, '本关失败']].map(([lv, pick, want]) => retry(lv === 1 ? 1 : 3, (k, st) => withPage(rec, { mobile: true, strict: true, storage: lv > 1 ? { 'swap-match.level': lv } : undefined, tag: `level${lv}-${k}` }, async (page) => {
    const c = await playCollect(page, pick, 'gesture');
    if (c.dlgName !== want) { rec.log.push(`第 ${lv} 关第 ${k} 个页面未出现${want}画面（${c.dlgName || '无'}）${k < 3 && lv > 1 ? '，换全新页面重试' : '，检查点不报告'}`); return; }
    st.done = true;
    const a = await L.audio(page);
    const ok = c.dlgStarts.some((x) => x.state === 'running' && x.audible);
    rec.cp(lv === 1 ? '1 过关画面出现时有音源开始播放、音频处于可发声状态' : '2 失败画面出现时有音源开始播放、音频处于可发声状态', ok, `${want}画面出现时新开始的音源：${fmtStarts(c.dlgStarts)}；音频环境 ${a.ctxStates.join(',')}`);
  }))));
};

export default [
  { id: 'TS-35', title: '消除、过关、失败时播放音效', fn: T35 },
  { id: 'TS-36', title: '静音按钮：立即停止、之后不响、再点恢复', fn: T36 },
  { id: 'TS-37', title: '手机只用手指滑动：第一次消除就能听到', fn: firstTouch('gesture', '滑动') },
  { id: 'TS-38', title: '手机只用手指轻点：第一次消除就能听到', fn: firstTouch('select', '轻点') },
  { id: 'TS-39', title: '手机只用手指：过关与失败时都能听到', fn: T39 },
];
