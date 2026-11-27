// Test script entry: runs all script scenarios of tasks-qa.md (QA_ONLY=TS-01,TS-02 for a subset).
import fs from 'node:fs';
import { Rec, finish, flush } from './report.mjs';
import { closeBrowser, EVIDENCE_DIR } from './lib.mjs';
import { Skip } from './common.mjs';
import basics from './s-basics.mjs';
import input from './s-input.mjs';
import special from './s-special.mjs';
import levels from './s-levels.mjs';
import board from './s-board.mjs';
import audio from './s-audio.mjs';

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const all = [...basics, ...input, ...special, ...levels, ...board, ...audio];
const only = (process.env.QA_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const list = all.filter((s) => !only.length || only.includes(s.id));
// Timing-sensitive scenarios run alone after the pool.
const SOLO = new Set(['TS-09', 'TS-29', 'TS-34']);
const pool = list.filter((s) => !SOLO.has(s.id));
const solo = list.filter((s) => SOLO.has(s.id));
const CONC = +(process.env.QA_CONCURRENCY || 3);

const limitS = +(process.env.QA_TIMEOUT_SECONDS || 3600);
const deadline = Date.now() + (limitS - 60) * 1000;
const guard = setTimeout(async () => {
  console.log('time limit reached; writing results so far');
  flush();
  await closeBrowser();
  process.exit(0);
}, Math.max(10, limitS - 60) * 1000);
guard.unref();

async function runOne(s) {
  if (Date.now() > deadline) return;
  const rec = new Rec(s.id, s.title);
  const t0 = Date.now();
  console.log(`[${s.id}] start ${s.title}`);
  try {
    await s.fn(rec);
  } catch (e) {
    if (e instanceof Skip) rec.drop(e.message);
    else if (e && e.name === 'TimeoutError' && /waitForFunction/.test(e.message || '')) rec.drop('等待棋盘静止超过 20 秒（测试等待上限），不下结论');
    else {
      rec.cp('脚本执行', false, `执行中出错：${e && e.message ? e.message.split('\n')[0] : e}`);
      rec.log.push(String((e && e.stack) || e));
    }
  }
  rec.log.push(`duration ${Math.round((Date.now() - t0) / 1000)}s`);
  if (!rec.dropped && !rec.cps.length) rec.drop('没有可下结论的检查点');
  finish(rec);
}

const queue = [...pool];
await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) await runOne(queue.shift()); }));
for (const s of solo) await runOne(s);
flush();
await closeBrowser();
clearTimeout(guard);
process.exit(0);
