// Scenario helpers shared by the scenario files.
import * as L from './lib.mjs';

export class Skip extends Error {}
export const skip = (why) => { throw new Skip(why); };

// Open a fresh context (+page) and run fn; context is always closed.
export async function withPage(rec, { mobile = false, storage, strict, viewport, tag } = {}, fn) {
  const ctx = await L.makeContext(mobile, { storage, strict, viewport });
  const log = [];
  let page;
  try {
    page = await L.openGame(ctx, log, { mobile });
    return await fn(page, log);
  } catch (e) {
    if (page && !(e instanceof Skip)) rec.ev(await L.shot(page, `${rec.id}-${tag || (mobile ? 'mobile' : 'desktop')}-error`));
    throw e;
  } finally {
    if (log.length) rec.log.push(`--- ${tag || (mobile ? 'mobile' : 'desktop')} client log ---`, ...log.slice(-200));
    await ctx.close().catch(() => {});
  }
}

export async function pressDialogButton(page, name) {
  const btn = page.getByRole('dialog').getByRole('button', { name, exact: true });
  const bb = await btn.boundingBox({ timeout: 5000 });
  if (page.__mobile) await L.touchTap(page, bb.x + bb.width / 2, bb.y + bb.height / 2);
  else await L.mouseClick(page, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await L.sleep(300);
  await L.waitStill(page).catch(() => {});
  await L.sleep(400);
}
export const endButtonOf = (dlgName) => (dlgName === '过关' ? '下一关' : '重玩本关');

// Read the start values of a level in a separate fresh context (level parameters reference).
export async function levelParams(level, mobile = false) {
  const ctx = await L.makeContext(mobile, { storage: { 'swap-match.level': level } });
  try {
    const page = await L.openGame(ctx, [], { mobile });
    return await L.hud(page);
  } finally { await ctx.close().catch(() => {}); }
}

export const fmtHud = (h) => `关${h.level} 分${h.score} 目标${h.target} 步${h.moves} 最高${h.high}`;
export const noPressed = (B) => B.g.flat().every((t) => !t || t.pressed !== 'true');
export const pressedNames = (B) => B.g.flat().filter((t) => t && t.pressed === 'true').map((t) => t.name);

// Positions of the predicted still board for removal set X (Set of r*8+c) from grid h (after swap).
// Returns per column the expected bottom (8-k) cells and k.
export function predictCols(h, X) {
  const cols = [];
  for (let c = 0; c < 8; c++) {
    const keep = [];
    for (let r = 0; r < 8; r++) if (!X.has(r * 8 + c)) keep.push(h[r][c]);
    cols.push({ k: 8 - keep.length, keep });
  }
  return cols;
}
// Compare still board A to prediction; returns {ok, diffs}
export function matchPrediction(A, cols) {
  const diffs = [];
  cols.forEach(({ k, keep }, c) => keep.forEach((t, i) => {
    const r = k + i;
    if (L.cellSig(A.g[r][c]) !== L.cellSig(t)) diffs.push(`${L.P(r, c)} 应为 ${L.cellSig(t)} 实为 ${L.cellSig(A.g[r][c])}`);
  }));
  return { ok: diffs.length === 0, diffs };
}
