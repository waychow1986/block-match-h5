// Result recording (script result contract v2). Results are re-written after every scenario
// so that a valid file exists even if the run is cut short.
import fs from 'node:fs';
import { writeEvidence } from './lib.mjs';

const RESULT_PATH = process.env.QA_RESULT_PATH || 'qa-result.json';
const results = new Map();
const started = Date.now();

export class Rec {
  constructor(id, title) {
    this.id = id; this.title = title; this.cps = []; this.evidence = []; this.log = []; this.dropped = false;
  }
  cp(step, passed, observation) {
    this.cps.push({ step, passed: !!passed, observation: String(observation).slice(0, 1500) });
    return !!passed;
  }
  ev(name) { if (name && !this.evidence.includes(name)) this.evidence.push(name); }
  drop(reason) { this.dropped = true; this.dropReason = reason; }
  get passed() { return this.cps.length > 0 && this.cps.every((c) => c.passed); }
}

export function finish(rec, extraLogs = []) {
  const logs = [...rec.log, ...extraLogs];
  if (rec.dropped) {
    console.log(`[${rec.id}] not reported: ${rec.dropReason}`);
    writeEvidence(`${rec.id}-not-reported.log`, `${rec.dropReason}\n${logs.join('\n')}`);
    results.delete(rec.id);
    flush();
    return;
  }
  if (!rec.passed || logs.length) rec.ev(writeEvidence(`${rec.id}-client.log`, logs.join('\n') || '(no client log lines)'));
  results.set(rec.id, { id: rec.id, passed: rec.passed, checkpoints: rec.cps, evidence: rec.evidence });
  console.log(`[${rec.id}] ${rec.passed ? 'PASS' : 'FAIL'}${rec.passed ? '' : ' ' + JSON.stringify(rec.cps.filter((c) => !c.passed))}`);
  flush();
}

export function flush(summaryOverride) {
  const list = [...results.values()].sort((a, b) => a.id.localeCompare(b.id));
  const failed = list.filter((s) => !s.passed).map((s) => s.id);
  const summary = summaryOverride || `执行 ${list.length} 个脚本场景：${list.length - failed.length} 个符合预期${failed.length ? `，不符合：${failed.join('、')}` : ''}（用时 ${Math.round((Date.now() - started) / 1000)} 秒）`;
  const out = {
    schemaVersion: 2,
    testedCommitSha: process.env.QA_CANDIDATE_SHA || '',
    summary,
    scenarios: list,
  };
  fs.writeFileSync(RESULT_PATH, JSON.stringify(out, null, 2));
}

// Run one scenario body with error capture; an exception becomes a failed checkpoint with evidence.
export async function run(id, title, body, opts = {}) {
  const rec = opts.rec || new Rec(id, title);
  const t0 = Date.now();
  try {
    await body(rec);
  } catch (e) {
    rec.cp('脚本执行', false, `执行中出错：${e && e.message ? e.message.split('\n')[0] : e}`);
    rec.log.push(String(e && e.stack || e));
    if (opts.page) { try { rec.ev(await opts.page().screenshot({ path: `${process.env.QA_EVIDENCE_DIR || 'evidence'}/${id}-error.png` }) && `${id}-error.png`); } catch { /* ignore */ } }
  }
  rec.log.push(`duration ${Math.round((Date.now() - t0) / 1000)}s`);
  if (!opts.defer) finish(rec);
  return rec;
}

export function resultsSoFar() { return results; }
