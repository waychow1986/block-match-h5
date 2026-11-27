// TS-10, TS-12, TS-14, TS-15, TS-17, TS-18
import * as L from './lib.mjs';
import { withPage, skip, fmtHud, pressDialogButton, endButtonOf, predictCols, matchPrediction } from './common.mjs';

const key = ([r, c]) => r * 8 + c;
const base = (t) => t.name.replace(/，.*/, '');
const isPlain3 = (x) => !x.rainbow && !x.specialInvolved && x.lines.length === 1 && x.maxLen === 3 && x.n === 3;
const specials = (g) => { const o = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r][c] && L.special(g[r][c])) o.push({ r, c, t: g[r][c] }); return o; };
const gsig = (g) => L.sig({ g });

// Execute move m (computed on B); optionally sample frames. Returns before/after info.
async function exec(page, B, m, { sample = true } = {}) {
  const h0 = await L.hud(page);
  const f0 = await L.floatsCount(page);
  if (sample) { await L.startSampler(page, 30); await L.sleep(60); }
  await L.gesture(page, B, m.a, m.b);
  await L.settle(page);
  await L.sleep(350);
  let dlg = await L.dialogState(page);
  let h1 = await L.hud(page);
  if (!dlg && (h1.score >= h1.target || h1.moves === 0)) { for (let i = 0; i < 30 && !dlg; i++) { await L.sleep(100); dlg = await L.dialogState(page); } h1 = await L.hud(page); }
  const frames = sample ? await L.stopSampler(page) : [];
  const floats = await L.floatsSince(page, f0);
  const gains = floats.map((f) => parseInt(f.text.replace(/[^\d]/g, ''), 10));
  const A = await L.readBoard(page);
  const boards = sample ? L.boardsFromFrames(frames) : [];
  const skipSig = new Set([gsig(B.g), m.after ? gsig(m.after) : '']);
  const mids = boards.filter((b) => !skipSig.has(gsig(b.g)) && L.lines(b.g).length > 0);
  return { m, B, A, h0, h1, gains, dlg, mids, boards };
}
async function continueAfterDialog(page, s) {
  if (s && s.dlg) await pressDialogButton(page, endButtonOf(s.dlg.name));
}
async function advance(page, pick = L.randomPick) {
  const B = await L.readBoard(page);
  const ms = L.allMoves(B.g);
  if (!ms.length) { await L.sleep(500); return null; }
  const s = await exec(page, B, pick(ms), { sample: false });
  await continueAfterDialog(page, s);
  return s;
}

const T10 = async (rec) => {
  const st = { fullBad: [], fullN: 0, samples: [], chains: [], moveBad: [] };
  for (const lv of [1, 6]) {
    await withPage(rec, { storage: { 'swap-match.level': lv }, tag: `level${lv}` }, async (page) => {
      for (let i = 0; i < 30; i++) {
        const B = await L.readBoard(page);
        const ms = L.allMoves(B.g);
        if (!ms.length) { await L.sleep(500); continue; }
        const plain = ms.filter(isPlain3);
        const m = plain.length && st.samples.length < 6 && i % 2 === 0 ? L.randomPick(plain) : L.randomPick(ms);
        const s = await exec(page, B, m, { sample: false });
        st.fullN++;
        const ls = L.lines(s.A.g);
        if (!s.dlg && (!L.full(s.A) || ls.length)) st.fullBad.push(`第 ${lv} 关 #${i + 1}：方块 ${s.A.count}，一线 ${ls.length}`);
        if (s.h1.moves !== s.h0.moves - 1) st.moveBad.push(`第 ${lv} 关 #${i + 1}：浮字 ${s.gains.length} 个，步数 ${s.h0.moves}→${s.h1.moves}`);
        if (s.gains.length >= 2) st.chains.push(`第 ${lv} 关 #${i + 1}：浮字 ${s.gains.map((g) => '+' + g).join(' ')}，步数 ${s.h0.moves}→${s.h1.moves}`);
        if (isPlain3(m) && s.gains.length === 1 && s.h1.score - s.h0.score === s.gains[0] && !s.dlg) {
          const X = new Set(m.lines[0].cells.map(key));
          const cols = predictCols(m.after, X);
          const pr = matchPrediction(s.A, cols);
          st.samples.push({ ok: pr.ok, o: `第 ${lv} 关消除 ${m.lines[0].cells.map((c) => L.P(...c)).join('、')}：各列补充格数 ${cols.map((c) => c.k).join('')}${pr.ok ? '，上方方块按序下移、颜色种类不变' : '；' + pr.diffs.slice(0, 6).join('；')}` });
        }
        await continueAfterDialog(page, s);
      }
    });
  }
  rec.cp('1 每次静止时 64 个方块齐全、无空位、没有 3 个及以上同色一线', st.fullBad.length === 0, `${st.fullN} 次有效交换后静止${st.fullBad.length ? '；不符合：' + st.fullBad.join('；') : '，都符合'}`);
  if (st.samples.length >= 3) rec.cp('2 恰好 3 个普通方块、无连锁的样本：上方方块按原顺序下移，顶部新出现格数等于被消除格数', st.samples.every((x) => x.ok), st.samples.map((x) => x.o).join('；'));
  else rec.log.push(`检查点 2 样本 ${st.samples.length} 个，不足 3 个，不下结论`);
  if (st.chains.length) rec.cp('3 每次有效交换不论几轮消除，剩余步数只减 1', st.moveBad.length === 0, `连锁样本：${st.chains.slice(0, 5).join('；')}${st.moveBad.length ? '；步数不符：' + st.moveBad.join('；') : '；全部交换步数都只减 1'}`);
  else rec.log.push('未出现 2 轮以上连锁，检查点 3 不下结论');
};

// Removal sets per round: round 1 from the move, later rounds from the intermediate boards.
function roundSets(s) {
  const out = [{ size: s.m.n, plain: !s.m.rainbow && !s.m.specialInvolved && s.m.maxLen === 3 }];
  for (const b of s.mids) {
    const ls = L.lines(b.g);
    const cells = new Set(ls.flatMap((l) => l.cells.map(key)));
    const plain = ls.every((l) => l.cells.length === 3 && l.cells.every(([r, c]) => b.g[r][c].kind === 'normal'));
    out.push({ size: cells.size, plain });
  }
  return out;
}
const T12 = async (rec) => withPage(rec, {}, async (page) => {
  for (let i = 0; i < 100; i++) {
    const B = await L.readBoard(page);
    const ms = L.allMoves(B.g);
    if (!ms.length) { await L.sleep(500); continue; }
    const plain = ms.filter((x) => !x.rainbow && !x.specialInvolved && x.maxLen === 3);
    const s = await exec(page, B, L.randomPick(plain.length ? plain : ms));
    const rs = roundSets(s);
    if (s.gains.length >= 2 && rs.length === s.gains.length) {
      for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
        if (rs[a].plain && rs[b].plain && rs[a].size === rs[b].size) {
          rec.ev(await L.shot(page, 'TS-12-after'));
          rec.cp('后一轮消除同样数量普通方块的浮字分值严格大于前一轮', s.gains[b] > s.gains[a],
            `第 ${i + 1} 次交换 ${L.P(...s.m.a)}→${L.P(...s.m.b)}：各轮消除 ${rs.map((r) => r.size).join('/')} 个，浮字 ${s.gains.map((g) => '+' + g).join(' ')}；比较第 ${a + 1} 轮 +${s.gains[a]} 与第 ${b + 1} 轮 +${s.gains[b]}（均为 ${rs[a].size} 个普通方块）`);
          return;
        }
      }
    }
    await continueAfterDialog(page, s);
  }
  skip('100 次有效交换内未出现可比较的两轮（测试等待上限）');
});

// A single straight 4-line of normal tiles that contains the dragged tile's landing cell.
const four = (x) => !x.rainbow && !x.specialInvolved && x.lines.length === 1 && x.maxLen === 4 && x.n === 4 && x.lines[0].cells.some(([r, c]) => r === x.b[0] && c === x.b[1]);

async function appearance(page, rec, A, sp, tag) {
  const same = A.g.flat().filter((t) => t.kind === 'normal' && t.color === sp.t.color);
  if (same.length < 2) return null;
  const sImg = await L.cellShot(page, sp.t);
  const n1 = await L.cellShot(page, same[0]);
  const n2 = await L.cellShot(page, same[1]);
  rec.ev(L.writeEvidence(`${rec.id}-${tag}-special.png`, sImg)); rec.ev(L.writeEvidence(`${rec.id}-${tag}-normal.png`, n1));
  return { d: await L.pixelDiff(page, sImg, n1), base: await L.pixelDiff(page, n1, n2), img: sImg };
}

const T14 = async (rec) => withPage(rec, {}, async (page) => {
  const got = {};
  const pos = [];
  let tracked = null;
  let tries = 0;
  for (let i = 0; i < 60 && tries < 30 && (!got.h || !got.v); i++) {
    const B = await L.readBoard(page);
    const ms = L.allMoves(B.g);
    if (!ms.length) { await L.sleep(500); continue; }
    const fours = ms.filter(four).filter((x) => !got[x.lines[0].dir]);
    if (!fours.length) { await advance(page); tries++; continue; }
    const m = fours[0];
    tries++;
    const before = new Set(specials(B.g).map((x) => base(x.t) + key([x.r, x.c])));
    const s = await exec(page, B, m);
    const ln = m.lines[0];
    const [r, c] = m.b;
    const k = ln.cells.filter(([rr, cc]) => cc === c && rr > r).length;
    const cand = specials(s.A.g).filter((x) => x.c === c && x.t.kind !== 'rainbow' && x.t.color === ln.color && !before.has(base(x.t) + key([x.r, x.c])));
    const nm = s.gains.length === 1 ? cand.find((x) => x.r === r + k) : cand.find((x) => x.r >= r);
    if (s.gains.length > 1 && !nm) { await continueAfterDialog(page, s); continue; }
    pos.push({ ok: !!nm, o: `${ln.dir === 'h' ? '横向' : '纵向'} 4 连 ${ln.cells.map((x) => L.P(...x)).join('、')}（${ln.color}色），被移动方块交换后在 ${L.P(r, c)}，浮字 ${s.gains.length} 个，${s.gains.length === 1 ? `应在 ${L.P(r + k, c)}` : `应在第 ${c + 1} 列、第 ${r + 1} 行或以下`}；该列新出现的同色整行/整列方块：${cand.map((x) => x.t.name).join('、') || '无'}` });
    if (nm) {
      rec.ev(await L.shot(page, `TS-14-${ln.dir}`));
      got[ln.dir] = { ap: await appearance(page, rec, s.A, nm, ln.dir), kind: nm.t.kind };
      if (!tracked) tracked = { c: nm.c, name: base(nm.t) };
    }
    await continueAfterDialog(page, s);
  }
  if (!pos.length) skip('30 次有效交换内未出现 4 连（测试等待上限）');
  rec.cp('1 4 个方块被消除，生成同色横向/纵向消除方块，位置为被移动方块的位置（之后只随下落移动）', pos.every((x) => x.ok), pos.map((x) => x.o).join('；'));
  const aps = Object.entries(got).filter(([, v]) => v.ap);
  if (aps.length) {
    let ok = aps.every(([, v]) => v.ap.d > Math.max(8, 3 * v.ap.base));
    let o = aps.map(([k, v]) => `${k === 'h' ? '横向 4 连' : '纵向 4 连'}生成的方块（${v.kind === 'row' ? '横向消除方块' : '纵向消除方块'}）与同色普通方块平均像素差 ${v.ap.d.toFixed(1)}（两个同色普通方块之间 ${v.ap.base.toFixed(1)}）`).join('；');
    if (aps.length === 2 && got.h.kind !== got.v.kind) { const d = await L.pixelDiff(page, got.h.ap.img, got.v.ap.img); ok = ok && d > 8; o += `；横向与纵向两种之间 ${d.toFixed(1)}`; }
    rec.cp('2 外观与普通方块明显不同（两种都出现时可互相区分）', ok, o);
  }
  for (let i = 0; i < 30 && tracked; i++) {
    const B = await L.readBoard(page);
    const cur = specials(B.g).find((x) => base(x.t) === tracked.name && x.c === tracked.c);
    if (!cur) { rec.log.push('跟踪的特殊方块已不在原列，检查点 3 不下结论'); break; }
    const ms = L.allMoves(B.g).filter((x) => !x.rainbow && !x.specialInvolved && x.maxLen === 3 && x.lines.some((l) => l.cells.some(([rr, cc]) => cc === cur.c && rr > cur.r)) && ![x.a, x.b].some(([rr, cc]) => cc === cur.c && rr <= cur.r));
    if (!ms.length) { await advance(page); continue; }
    const m = ms[0];
    const s = await exec(page, B, m, { sample: false });
    if (s.gains.length === 1 && !s.dlg) {
      const X = new Set(m.lines.flatMap((l) => l.cells.map(key)));
      let k = 0; for (let rr = cur.r + 1; rr < 8; rr++) if (X.has(rr * 8 + cur.c)) k++;
      const there = s.A.g[cur.r + k][cur.c];
      rec.ev(await L.shot(page, 'TS-14-fall'));
      rec.cp('3 其下方同列消除（无连锁）后，它仍在同一列，下移格数等于下方被消除格数，名称不变', !!there && base(there) === tracked.name,
        `${tracked.name} 交换前在 ${L.P(cur.r, cur.c)}，下方同列被消除 ${k} 格，应在 ${L.P(cur.r + k, cur.c)}；该位置实际为 ${there ? there.name : '无'}`);
      break;
    }
    await continueAfterDialog(page, s);
  }
});

const alongOf = (t, r, c) => (t.kind === 'row' ? Array.from({ length: 8 }, (_, j) => [r, j]) : Array.from({ length: 8 }, (_, j) => [j, c]));
function triggerOk(x) {
  if (x.rainbow || x.lines.length !== 1 || x.n !== 3 || x.maxLen !== 3) return false;
  const h = x.after, ln = x.lines[0];
  const sp = ln.cells.filter(([r, c]) => L.special(h[r][c]));
  if (sp.length !== 1) return false;
  const [sr, sc] = sp[0];
  const t = h[sr][sc];
  if (t.kind !== 'row' && t.kind !== 'col') return false;
  if ([x.a, x.b].some(([r, c]) => h[r][c].kind === 'rainbow')) return false;
  return alongOf(t, sr, sc).every(([r, c]) => (r === sr && c === sc) || !L.special(h[r][c]));
}
const T15 = async (rec) => withPage(rec, {}, async (page) => {
  for (let i = 0; i < 40; i++) {
    const B = await L.readBoard(page);
    const ms = L.allMoves(B.g);
    if (!ms.length) { await L.sleep(500); continue; }
    const trig = ms.filter(triggerOk);
    if (!trig.length) {
      const f = ms.filter(four);
      const s = await exec(page, B, f.length ? f[0] : L.randomPick(ms.filter((x) => !x.specialInvolved).length ? ms.filter((x) => !x.specialInvolved) : ms), { sample: false });
      await continueAfterDialog(page, s);
      continue;
    }
    const m = trig[0];
    const h = m.after;
    const [sr, sc] = m.lines[0].cells.find(([r, c]) => L.special(h[r][c]));
    const sp = h[sr][sc];
    const spBefore = new Set(specials(h).map((x) => base(x.t) + key([x.r, x.c])));
    const s = await exec(page, B, m, { sample: false });
    const lineSet = new Set(m.lines[0].cells.map(key));
    const R = new Set([...lineSet, ...alongOf(sp, sr, sc).map(key)]);
    const pR = predictCols(h, R), pL = predictCols(h, lineSet);
    // new specials: any special in the still board that is not a survivor from the prediction
    const survivors = new Set(pR.flatMap((c, j) => c.keep.filter((t) => L.special(t)).map((t) => base(t) + j)));
    const newSp = specials(s.A.g).filter((x) => !survivors.has(base(x.t) + x.c));
    if (!(s.gains.length === 1 && s.h1.score - s.h0.score === s.gains[0] && newSp.length === 0 && !s.dlg)) {
      rec.log.push(`#${i + 1} 触发样本不合条件（浮字 ${s.gains.length} 个，新特殊方块 ${newSp.length}），继续`);
      await continueAfterDialog(page, s);
      continue;
    }
    const mR = matchPrediction(s.A, pR), mL = matchPrediction(s.A, pL);
    const tag = sp.kind === 'row' ? '整行（横向消除方块）' : '整列（纵向消除方块）';
    rec.ev(await L.shot(page, 'TS-15-after'));
    rec.cp(`1 ${tag}被消除：静止棋盘与按 R 推算逐格一致，与按 L 推算不一致`, mR.ok && !mL.ok,
      `${sp.name}（交换后位置 ${L.P(sr, sc)}）所在一线 ${m.lines[0].cells.map((x) => L.P(...x)).join('、')}；按 R：${mR.ok ? '一致' : '不一致——' + mR.diffs.slice(0, 5).join('；')}；按 L：${mL.ok ? '一致' : `不一致（${mL.diffs.length} 格不同）`}`);
    const untouched = pR.map((c, j) => (c.k === 0 ? j : -1)).filter((j) => j >= 0);
    const colsSame = untouched.every((j) => Array.from({ length: 8 }, (_, r) => L.cellSig(s.A.g[r][j]) === L.cellSig(h[r][j])).every(Boolean));
    rec.cp('2 既不在该行/列也不在该一线中的方块未被消除，k=0 的列与交换后相同', mR.ok && colsSame, `不在 R 中的方块${mR.ok ? '全部在推算位置' : '有不在推算位置的'}；k=0 的列：${untouched.map((j) => j + 1).join(',') || '无'}，${colsSame ? '与交换后完全相同' : '与交换后不同'}`);
    const fin = L.full(s.A) && L.lines(s.A.g).length === 0;
    rec.cp('3 本次得分大于 0，剩余步数只减 1，静止后 64 个方块齐全、没有一线', s.h1.score > s.h0.score && s.h1.moves === s.h0.moves - 1 && fin,
      `${fmtHud(s.h0)} → ${fmtHud(s.h1)}，浮字 +${s.gains[0]}，方块 ${s.A.count}，一线 ${L.lines(s.A.g).length}`);
    return;
  }
  skip('40 次有效交换内未得到符合条件的样本（测试等待上限）');
});

// TS-17 and TS-18 share one board: run once, cache the result.
let rainbowRun = null;
const rainbowFlow = () => (rainbowRun ||= (async () => {
  const out = { t17: null, t18: null, log: [] };
  const ctx = await L.makeContext(false, {});
  try {
    const page = await L.openGame(ctx, out.log, {});
    const hasRb = (g) => g.flat().some((t) => t && t.kind === 'rainbow');
    for (let i = 0; i < 150; i++) {
      const B = await L.readBoard(page);
      const ms = L.allMoves(B.g);
      if (!ms.length) { await L.sleep(500); continue; }
      const five = ms.filter((x) => !x.rainbow && x.maxLen >= 5 && !x.specialInvolved);
      const m = five.length ? five[0] : L.randomPick(ms.filter((x) => !x.rainbow).length ? ms.filter((x) => !x.rainbow) : ms);
      const s = await exec(page, B, m, { sample: false });
      if (!s.dlg && hasRb(s.A.g) && !hasRb(B.g)) {
        const ln = m.lines.find((l) => l.cells.length >= 5);
        // the 5-line cells: in the still board none of the line's other tiles may survive in place (prediction when no chain)
        let removed = null;
        if (ln && s.gains.length === 1) {
          const X = new Set(m.lines.flatMap((l) => l.cells.map(key)));
          const [gr, gc] = m.b; X.delete(key([gr, gc]));
          const h2 = m.after.map((row) => row.slice());
          h2[gr][gc] = { kind: 'rainbow', color: null };
          removed = matchPrediction(s.A, predictCols(h2, X));
        }
        const A = s.A;
        const rb = specials(A.g).find((x) => x.t.kind === 'rainbow');
        const norm = A.g.flat().filter((t) => t.kind === 'normal');
        const n2 = norm.find((t) => t !== norm[0] && t.color === norm[0].color) || norm[1];
        const striped = A.g.flat().find((t) => t.kind === 'row' || t.kind === 'col');
        const ir = await L.cellShot(page, rb.t), inr = await L.cellShot(page, norm[0]), inr2 = await L.cellShot(page, n2);
        const d = await L.pixelDiff(page, ir, inr), b0 = await L.pixelDiff(page, inr, inr2);
        const ds = striped ? await L.pixelDiff(page, ir, await L.cellShot(page, striped)) : null;
        L.writeEvidence('TS-17-rainbow.png', ir);
        L.writeEvidence('TS-17-normal.png', inr);
        out.t17 = { m, s, ln, removed, d, base: b0, ds, shot: await L.shot(page, 'TS-17-board') };
        break;
      }
      await continueAfterDialog(page, s);
    }
    if (!out.t17) return out;
    const B = await L.readBoard(page);
    const rb = specials(B.g).find((x) => x.t.kind === 'rainbow');
    if (!rb) return out;
    const nbrs = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [rb.r + dr, rb.c + dc]).filter(([r, c]) => r >= 0 && c >= 0 && r < 8 && c < 8 && B.g[r][c].kind === 'normal');
    if (!nbrs.length) return out;
    const rp = [rb.r, rb.c];
    const noLine = nbrs.filter((n) => L.lines(L.swapped(B.g, n, rp)).filter((l) => l.cells.some(([r, c]) => (r === n[0] && c === n[1]) || (r === rp[0] && c === rp[1]))).length === 0);
    const nb = (noLine.length ? noLine : nbrs)[0];
    const C = B.g[nb[0]][nb[1]].color;
    const cs = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (B.g[r][c].color === C) cs.push([r, c]);
    const after = L.swapped(B.g, nb, rp);
    const X = new Set([key(nb)]); // rainbow lands on nb
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const t = after[r][c];
      if (t.color !== C) continue;
      X.add(key([r, c]));
      if (t.kind === 'row' || t.kind === 'col') alongOf(t, r, c).forEach((p) => X.add(key(p)));
    }
    const pr = predictCols(after, X);
    const h0 = await L.hud(page);
    const f0 = await L.floatsCount(page);
    await L.startSampler(page, 30); await L.sleep(60);
    await L.gesture(page, B, nb, rp);
    await L.settle(page); await L.sleep(400);
    const frames = await L.stopSampler(page);
    const h1 = await L.hud(page);
    const A = await L.readBoard(page);
    const gains = (await L.floatsSince(page, f0)).map((f) => parseInt(f.text.replace(/[^\d]/g, ''), 10));
    const boards = [...L.boardsFromFrames(frames).map((b) => ({ g: b.g })), A].filter((b) => gsig(b.g) !== gsig(B.g) && gsig(b.g) !== gsig(after));
    const hit = boards.findIndex((b) => matchPrediction(b, pr).ok);
    const m1 = hit >= 0 ? { ok: true, diffs: [] } : matchPrediction(boards[0] || A, pr);
    out.t18 = { C, cs, nb, rp, h0, h1, A, gains, m1, hit, nBoards: boards.length, noLine: noLine.length > 0, shot: await L.shot(page, 'TS-18-after') };
    return out;
  } finally { await ctx.close().catch(() => {}); }
})());

const T17 = async (rec) => {
  const r = await rainbowFlow();
  if (!r.t17) skip('150 次有效交换内未出现彩色消除方块（测试等待上限）');
  const t = r.t17;
  rec.ev(t.shot); rec.ev('TS-17-rainbow.png'); rec.ev('TS-17-normal.png');
  const lineOk = !!t.ln && (t.removed ? t.removed.ok : true) && t.s.h1.score > t.s.h0.score;
  rec.cp('形成彩色消除方块的 5 个及以上同色一线被消除', lineOk,
    `${t.ln ? `${t.ln.cells.length} 连 ${t.ln.cells.map((x) => L.P(...x)).join('、')}（${t.ln.color}色）` : '交换前推算没有 5 连（由连锁形成，无法核对该一线）'}；浮字 ${t.s.gains.map((g) => '+' + g).join(' ')}；${t.removed ? (t.removed.ok ? '静止棋盘与“该一线其余方块被消除”的推算一致' : '与推算不一致：' + t.removed.diffs.slice(0, 5).join('；')) : '有连锁，按得分增加判断'}`);
  rec.cp('彩色消除方块外观与普通方块、整行/整列方块明显不同', t.d > Math.max(8, 3 * t.base) && (t.ds === null || t.ds > 8),
    `与普通方块平均像素差 ${t.d.toFixed(1)}（两个同色普通方块之间 ${t.base.toFixed(1)}）；与整行/整列方块 ${t.ds === null ? '（棋盘上没有此类方块，不比）' : t.ds.toFixed(1)}`);
};
const T18 = async (rec) => {
  const r = await rainbowFlow();
  if (!r.t17) skip('TS-17 未出现彩色消除方块，本场景不报告');
  if (!r.t18) skip('彩色消除方块旁没有普通方块');
  const t = r.t18;
  rec.ev(t.shot);
  rec.cp('1 交换被接受（不弹回），剩余步数恰好减 1，得分增加', t.h1.moves === t.h0.moves - 1 && t.h1.score > t.h0.score,
    `${L.P(...t.nb)}（${t.C}色${t.noLine ? '，交换后不形成一线' : ''}）与彩色消除方块 ${L.P(...t.rp)} 交换；${fmtHud(t.h0)} → ${fmtHud(t.h1)}`);
  rec.cp('2 交换前颜色 C 的全部方块都被消除，彩色消除方块被用掉', t.m1.ok,
    `交换前 ${t.C} 色 ${t.cs.length} 个：${t.cs.map((x) => L.P(...x)).join('、')}；动画逐帧棋盘（${t.nBoards} 个）中${t.m1.ok ? `第 ${t.hit + 1} 个与“这些方块和彩色消除方块都被消除”后的推算逐格一致` : '没有与推算一致的：' + t.m1.diffs.slice(0, 6).join('；')}`);
  rec.cp('3 静止后 64 个方块、没有一线', L.full(t.A) && L.lines(t.A.g).length === 0, `方块 ${t.A.count}，一线 ${L.lines(t.A.g).length}`);
};

export default [
  { id: 'TS-10', title: '下落、补充、连锁后棋盘填满且只扣 1 步', fn: T10 },
  { id: 'TS-12', title: '连锁中后一轮同样数量的普通方块得分更高', fn: T12 },
  { id: 'TS-14', title: '4 个连成一线生成整行/整列方块，并随下落移动', fn: T14 },
  { id: 'TS-15', title: '触发整行/整列方块：整行或整列被消除', fn: T15 },
  { id: 'TS-17', title: '5 个连成一线生成彩色消除方块', fn: T17 },
  { id: 'TS-18', title: '彩色消除方块与相邻方块交换：全场该颜色全部消除', fn: T18 },
];
