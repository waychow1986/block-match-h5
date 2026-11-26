/**
 * Runs a Web Animations API animation when available (TD-007). Timing of the
 * game never depends on it: callers advance with their own timers, so a missing
 * or failing `animate()` only loses the visual effect.
 */
export function animate(el: HTMLElement, keyframes: Keyframe[], ms: number): void {
  if (typeof el.animate !== 'function') return;
  try {
    el.animate(keyframes, { duration: ms, easing: 'ease-in', fill: 'forwards' });
  } catch {
    // Visual only.
  }
}
