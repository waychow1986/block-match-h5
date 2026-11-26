// Entry orchestration: the long sound-on game A runs alongside the short scenarios; game B (muted) follows them.
// QA_GROUPS (optional, comma list of: a, b, short) and QA_ONLY (scenario ids for short) restrict a trial run.
import { closeBrowser } from './lib.mjs';
import { finish, flush } from './report.mjs';
import { gameA, gameB } from './long.mjs';
import { ts20, ts21, ts22, ts24 } from './short.mjs';
import { ts02and04, ts03, ts05, ts06, ts07 } from './short2.mjs';
import { ts25, ts26, ts27, ts32 } from './short3.mjs';
import { ts34, ts35 } from './short4.mjs';

const groups = (process.env.QA_GROUPS || 'a,b,short').split(',').map((s) => s.trim());
const timeoutS = Number(process.env.QA_TIMEOUT_SECONDS) || 55 * 60;

flush();
// Leave a margin before the platform timeout: write what we have and stop.
setTimeout(async () => {
  console.log('timeout guard reached; writing results so far');
  flush();
  await closeBrowser();
  process.exit(0);
}, Math.max(60, timeoutS - 90) * 1000).unref();

let rec03 = null;
const shorts = async () => {
  if (!groups.includes('short')) return;
  for (const f of [ts20, ts22, ts24, ts07, ts05, ts06, ts25, ts26, ts27, ts32, ts34, ts35, ts21]) await f();
  rec03 = await ts03();
  await ts02and04();
};

const runA = async () => {
  if (!groups.includes('a')) return null;
  return gameA();
};

try {
  const [RA] = await Promise.all([
    runA(),
    (async () => { await shorts(); if (groups.includes('b')) await gameB(); })(),
  ]);
  if (RA) {
    for (const [id, r] of Object.entries(RA)) {
      if (id === 'TS-03') {
        if (rec03 && !rec03.dropped) {
          rec03.cps.push(...r.cps); r.evidence.forEach((x) => rec03.ev(x));
          finish(rec03);
          rec03 = null;
        } else if (!r.dropped) finish(r);
        continue;
      }
      finish(r);
    }
  }
  if (rec03) finish(rec03);
} catch (e) {
  console.error(e);
} finally {
  flush();
  await closeBrowser();
}
process.exit(0);
