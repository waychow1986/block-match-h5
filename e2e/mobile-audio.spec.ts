import { expect, test, type Page } from '@playwright/test';
import { audioLog, installStrictAudio } from './audio-policy';
import { dialog, dragSwap, pickSwap, readGrid, tapSwap, waitSettled } from './helpers';

/** Each of 4 finger swaps, the first being the page's first input, is heard under a strict autoplay policy. */
async function everyRemovalHeard(page: Page, how: 'swipe' | 'tap'): Promise<void> {
  await installStrictAudio(page);
  await page.goto('/');
  let heard = 0;
  for (let i = 0; i < 4; i++) {
    if (i > 0 && (await dialog(page).count()) > 0) {
      // A lucky cascade cleared the level; continue on the next one (a tap on "下一关").
      await dialog(page).getByRole('button', { name: '下一关' }).tap();
      await expect(dialog(page)).toHaveCount(0);
    }
    const move = pickSwap(await readGrid(page), 'weak');
    expect(move, 'a valid swap exists').not.toBeNull();
    if (how === 'swipe') await dragSwap(page, move![0], move![1], true);
    else await tapSwap(page, move![0], move![1], true);
    await waitSettled(page);
    const log = await audioLog(page);
    expect(log.activatedResumes, `audio unlocked in an activation event by swap ${i + 1}`).toBeGreaterThan(0);
    expect(log.audible, `swap ${i + 1} is heard`).toBeGreaterThan(heard);
    expect(log.pendingStarts, 'no sound left blocked').toBe(0);
    heard = log.audible;
  }
}

test.describe('AC-21 phone touch: sound from the first removal', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'mobile', 'touch-only phone'));

  test('first input is a finger swipe', async ({ page }) => {
    await everyRemovalHeard(page, 'swipe');
  });

  test('first input is two finger taps', async ({ page }) => {
    await everyRemovalHeard(page, 'tap');
  });
});
