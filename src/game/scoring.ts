/** Points for removing n tiles at once: S(n) = 10·n² (TD-003). */
export function scoreFor(n: number): number {
  return 10 * n * n;
}
