import { expect, test } from '@playwright/test';
import { audioLog, installStrictAudio } from './audio-policy';
import { activate, pickSwap, readGrid, readNumber, tapSwap, weakSwap } from './helpers';

test('AC-20 removal sounds; mute stops playing sounds, silences moves, and unmute restores sound', async ({ page }, info) => {
  const touch = info.project.name === 'mobile';
  await installStrictAudio(page);
  await page.goto('/');
  const mute = page.getByRole('button', { name: '静音', exact: true });
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');

  const move = pickSwap(await readGrid(page), 'weak');
  expect(move).not.toBeNull();
  await tapSwap(page, move![0], move![1], touch);
  await expect.poll(async () => (await audioLog(page)).audible).toBeGreaterThan(0);
  const playing = (await audioLog(page)).active;
  await activate(page, mute, touch);
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  const afterMute = await audioLog(page);
  expect(afterMute.active).toBe(0);
  expect(afterMute.stopped).toBeGreaterThanOrEqual(playing);

  await page.waitForTimeout(1500);
  const silent = await audioLog(page);
  const level = await readNumber(page, '当前关卡');
  const score = await readNumber(page, '本关得分');
  for (let i = 0; i < 2; i++) await weakSwap(page, touch);
  const muted = await audioLog(page);
  expect(muted.audible + muted.pendingStarts).toBe(silent.audible + silent.pendingStarts);
  // Tiles were still removed while muted (score grew, or a lucky cascade cleared the level).
  const progressed = (await readNumber(page, '当前关卡')) > level || (await readNumber(page, '本关得分')) > score;
  expect(progressed).toBe(true);

  await activate(page, mute, touch);
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  for (let i = 0; i < 2; i++) await weakSwap(page, touch);
  await expect.poll(async () => (await audioLog(page)).audible).toBeGreaterThan(muted.audible);
  expect(await page.locator('audio, video').count()).toBe(0);
});
