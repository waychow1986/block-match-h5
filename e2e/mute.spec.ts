import { expect, test, type Page } from '@playwright/test';
import { activate, findGroup, groupAt, readGrid, readNumber, tile, waitSettled } from './helpers';

/** Counts Web Audio source starts/stops in the page (test-side instrumentation only). */
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { audioLog: { starts: number; active: Set<unknown>; stoppedWhileActive: number } };
    w.audioLog = { starts: 0, active: new Set(), stoppedWhileActive: 0 };
    const proto = AudioScheduledSourceNode.prototype;
    const start = proto.start;
    const stop = proto.stop;
    proto.start = function (this: AudioScheduledSourceNode, ...args: [number?]) {
      w.audioLog.starts++;
      w.audioLog.active.add(this);
      this.addEventListener('ended', () => w.audioLog.active.delete(this));
      return start.apply(this, args);
    };
    proto.stop = function (this: AudioScheduledSourceNode, ...args: [number?]) {
      if (args[0] === undefined && w.audioLog.active.delete(this)) w.audioLog.stoppedWhileActive++;
      return stop.apply(this, args);
    };
  });
}

const log = (page: Page): Promise<{ starts: number; active: number; stopped: number }> =>
  page.evaluate(() => {
    const l = (window as unknown as { audioLog: { starts: number; active: Set<unknown>; stoppedWhileActive: number } }).audioLog;
    return { starts: l.starts, active: l.active.size, stopped: l.stoppedWhileActive };
  });

async function removeGroup(page: Page, touch: boolean, biggest = false): Promise<void> {
  const grid = await readGrid(page);
  let cell = findGroup(grid)!;
  if (biggest) {
    for (let row = 1; row <= 10; row++)
      for (let col = 1; col <= 10; col++)
        if (groupAt(grid, { row, col }).length > groupAt(grid, cell).length) cell = { row, col };
  }
  await activate(page, tile(page, grid, cell), touch);
}

test('AC-14 mute stops playing sounds, silences moves, and unmute restores sound', async ({ page }, info) => {
  const touch = info.project.name === 'mobile';
  await instrument(page);
  await page.goto('/');
  const mute = page.getByRole('button', { name: '静音', exact: true });
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  await removeGroup(page, touch, true);
  await expect.poll(async () => (await log(page)).starts).toBeGreaterThan(0);
  const playing = (await log(page)).active;
  await activate(page, mute, touch);
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  const afterMute = await log(page);
  expect(afterMute.active).toBe(0);
  expect(afterMute.stopped).toBeGreaterThanOrEqual(playing);
  await waitSettled(page);

  const starts = afterMute.starts;
  const score = await readNumber(page, '当前分数');
  await removeGroup(page, touch);
  await waitSettled(page);
  expect((await log(page)).starts).toBe(starts);
  expect(await readNumber(page, '当前分数')).toBeGreaterThan(score);

  await activate(page, mute, touch);
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await removeGroup(page, touch);
  await expect.poll(async () => (await log(page)).starts).toBeGreaterThan(starts);
  expect(await page.locator('audio, video').count()).toBe(0);
});
